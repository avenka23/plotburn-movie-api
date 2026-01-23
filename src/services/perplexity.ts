import type { Env, MovieTruth, MovieMeta, PerplexityResponse } from '../types';
import { fetchMovieCredits } from './tmdb';
import { getTruthKey, USD_TO_INR } from '../constants';
import { Logger } from '../utils/logger';

export async function getOrCreateMovieTruth(
	tmdbId: string,
	movieMeta: MovieMeta,
	env: Env,
	correlationId: string
): Promise<MovieTruth> {
	const key = getTruthKey(env, tmdbId);
	const logger = new Logger(env, '/api/perplexity', 'POST', correlationId);

	// Step 1: Check if truth already exists in KV
	const cached = await env.TRUTH_KV.get(key, { type: 'json' });
	if (cached) {
		return cached as MovieTruth;
	}

	// Step 2: Fetch credits to get director name
	const credits = await fetchMovieCredits(tmdbId, env, correlationId);
	const directors = credits.crew
		.filter((member) => member.job === 'Director')
		.map((d) => d.name);
	const directorText = directors.length > 0 ? `, directed by ${directors.join(' & ')}` : '';

	// Step 3: Get language name from spoken_languages
	const languageInfo = movieMeta.spoken_languages.find(
		(lang) => lang.iso_639_1 === movieMeta.original_language
	);
	const languageName = languageInfo?.english_name || movieMeta.original_language.toUpperCase();

	// Get primary genre
	const primaryGenre = movieMeta.genres.length > 0 ? movieMeta.genres[0].name : 'film';

	// Step 4: Build Perplexity truth prompt
	const userPrompt = `Analyze: ${movieMeta.title} (${movieMeta.release_date.split('-')[0]}), ${languageName} ${primaryGenre}${directorText}

Find and report:

1. PREMISE (2-3 sentences, no spoilers)
What happens in the movie? Just the basic setup.

2. WHAT IT PROMISES
Based on the title, genre, and marketing - what kind of movie does this obviously claim to be?

3. HOW PEOPLE ARE REACTING
Find actual critic/audience reactions from ANY source (professional reviews, blogs, YouTube, regional sites, forums):
- Critics demanding "depth" from silly movies?
- People dismissing it unfairly?
- Any groups fighting about it?

Quote 3-5 actual review snippets with sources (even if it's a blog or regional newspaper).

4. THE GAP
One sentence: What IS this movie vs what are people demanding it be?

5. AUDIENCE RECEPTION (Watch or Skip?)
Check ANY available sources:
- Big sites: RT, IMDB, Letterboxd if they exist
- Regional: Local review sites, newspapers, film blogs
- Social: YouTube reviews, comments, Twitter/X reactions
- Box office: Regional collections if reported

Score 1-10:
1-2 = Avoid (universally panned)
3-4 = Skip It (mostly negative)
5 = Mixed Bag (divisive)
6-7 = Worth Watching (decent)
8 = Strong Approval (well-received)
9-10 = Universal Acclaim (everyone loves it)

Give:
- Score: [number]
- Label: [from scale above]
- Why: One sentence explaining score based on sources you found
- Sources: List WHATEVER you found (RT %, IMDB rating, regional review consensus, YouTube review sentiment, box office performance, etc.)`;

	const body = {
		model: 'sonar',
		messages: [
			{
				role: 'system',
				content: `You extract movie facts for PlotBurn, a satire site that roasts how people react to movies.

For reception: Use WHATEVER sources exist:
- International: RT, IMDB, Letterboxd, Metacritic
- Regional: Local review sites, newspapers, film blogs, entertainment portals
- Social: YouTube reviews, Twitter/X sentiment, Reddit threads
- Commercial: Box office reports (local or international)

Don't say "insufficient data" just because RT/IMDB don't exist. Regional movies have regional sources.

For reactions: Quote from ANY credible source - big critics, regional reviewers, bloggers, YouTube channels.

Report only what you actually find. Don't invent. Translate to English. No spoilers.`,
			},
			{
				role: 'user',
				content: userPrompt,
			},
		],
		temperature: 0.3,
		max_tokens: 2000,
		search_recency_filter: 'month',
	};

	const apiStartTime = Date.now();
	const res = await fetch('https://api.perplexity.ai/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	const apiDuration = Date.now() - apiStartTime;

	if (!res.ok) {
		const errorText = await res.text();
		await logger.logExternalAPICall(
			'Perplexity Sonar',
			{
				movieId: tmdbId,
				movieTitle: movieMeta.title,
				model: 'sonar',
				stage: 'truth'
			},
			undefined,
			`${res.status} ${res.statusText}: ${errorText}`,
			apiDuration
		);
		throw new Error(`Perplexity API failed: ${res.status} ${res.statusText}`);
	}

	const data = (await res.json()) as PerplexityResponse;

	// Log successful API call
	await logger.logExternalAPICall(
		'Perplexity Sonar',
		{
			movieId: tmdbId,
			movieTitle: movieMeta.title,
			model: 'sonar',
			stage: 'truth',
		},
		{
			tokens: data.usage.total_tokens,
			cost_usd: data.usage.cost.total_cost,
			cost_inr: data.usage.cost.total_cost * USD_TO_INR,
			citations_count: data.citations?.length || 0,
		},
		undefined,
		apiDuration
	);

	const content = data.choices[0].message.content;

	// Step 5: Build MovieTruth object
	const truth: MovieTruth = {
		source: 'perplexity:sonar',
		fetchedAt: new Date().toISOString(),
		model: data.model,
		costEstimateINR: data.usage.cost.total_cost * USD_TO_INR,
		citations: data.citations || [],
		searchResults: (data.search_results || []).map((sr) => ({
			title: sr.title,
			url: sr.url,
			date: sr.date,
			snippet: sr.snippet,
		})),
		content,
		raw: JSON.stringify(data),
		usage: data.usage,
	};

	await env.TRUTH_KV.put(key, JSON.stringify(truth));

	return truth;
}
