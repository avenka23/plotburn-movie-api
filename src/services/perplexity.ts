import type { Env, MovieTruth, MovieMeta, PerplexityResponse } from '../types';
import { fetchMovieCredits } from './tmdb';
import { getTruthKey, USD_TO_INR } from '../constants';
import { Logger } from '../utils/logger';

export async function getOrCreateMovieTruth(tmdbId: string, movieMeta: MovieMeta, env: Env, correlationId: string): Promise<MovieTruth> {
	const key = getTruthKey(env, tmdbId);
	const logger = new Logger(env, '/api/perplexity', 'POST', correlationId);

	// Step 1: Check if truth already exists in KV
	const cached = await env.TRUTH_KV.get(key, { type: 'json' });
	if (cached) {
		return cached as MovieTruth;
	}

	// Step 2: Fetch credits to get director name
	const credits = await fetchMovieCredits(tmdbId, env, correlationId);
	const directors = credits.crew.filter((member) => member.job === 'Director').map((d) => d.name);
	const directorText = directors.length > 0 ? `, directed by ${directors.join(' & ')}` : '';

	// Get language name from spoken_languages by matching original_language code
	const languageInfo = movieMeta.spoken_languages.find((lang) => lang.iso_639_1 === movieMeta.original_language);
	const languageName = languageInfo?.english_name || movieMeta.original_language.toUpperCase();

	// Step 3: Call Perplexity Sonar API for movie research
	const userPrompt = `Find a story and reception breakdown for: ${movieMeta.title} (${movieMeta.release_date.split('-')[0]})${movieMeta.genres.length > 0 ? `, a ${movieMeta.genres.map((g) => g.name).join('/')} film` : ''}${directorText}, originally in ${languageName}.`;

	const body = {
		model: 'sonar',
		messages: [
			{
				role: 'system',
				content: `You are a movie researcher. For the given film, gather accurate, well-structured information from reliable web sources and present it clearly.

Provide:

1) Plot: 200–250 words summarizing the beginning, middle, and end.
2) Main Characters: Bullet list with a one-line description of each character's role and arc.
3) Key Conflicts: Bullet list describing the main conflicts and how they are resolved.
4) Themes & Tone: Bullet list covering major themes, genre, and emotional tone.
5) Notable Story Elements:
   - Important coincidences or plot conveniences
   - Common tropes or clichés used
   - Moments often described as melodramatic, over-the-top, or unintentionally funny by viewers or critics
6) Audience & Critic Pulse:
   - Overall reception (positive / mixed / negative)
   - 3–5 commonly mentioned strengths
   - 3–5 commonly mentioned weaknesses
   - Any widely discussed scenes, performances, memes, or controversies

All information must be factual and grounded in real web sources. Do not invent details or exaggerate.`,
			},
			{
				role: 'user',
				content: userPrompt,
			},
		],
		temperature: 0.3,
		max_tokens: 3000,
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

	// Step 4: Store in TRUTH_KV
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
