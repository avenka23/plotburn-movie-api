import type { Env, MovieMeta, MovieTruth, GrokResponse } from '../types';
import { Logger } from '../utils/logger';

export async function generateRoast(facts: MovieMeta, truth: MovieTruth, env: Env, correlationId: string) {
	const logger = new Logger(env, '/api/grok/roast', 'POST', correlationId);
	const body = {
		model: 'grok-4-1-fast-non-reasoning',
		temperature: 0.9,
		max_tokens: 1000,
		repetition_penalty: 1.08,
		top_p: 0.92,
		messages: [
			{
				role: 'system',
				content: `### ROLE
Friend roasting a movie. Funny, honest, conversational.

### VOICE RULES
- NEVER use character names - say "the hero", "the villain", "the wife", "the star"
- No film jargon
- Ban pretentious words: schtick, trope, arc, protagonist, antagonist, slapstick, melodrama, cliche, filler, stakes, beats
- Use contractions: "doesn't" not "does not"
- Valid JSON only

### HOW TO ROAST
Describe what happens, then why it sucks. Natural sentences.

BAD: "Pacing drags."
GOOD: "Takes forever to get anywhere. Same scenes repeat three times."

BAD: "Forced romance."
GOOD: "Two people smile once, suddenly buying furniture together. Zero buildup."

BAD: "Weak villain motivation."
GOOD: "Bad guy's mad someone ate his sandwich in 2003. Still hunting them down."

BAD: "Poor character development."
GOOD: "Hero goes from coward to action star between scenes. No explanation."

BAD: "Plot holes everywhere."
GOOD: "Villain knows the hero's address but keeps missing him at coffee shops instead."

BAD: "Unearned emotional moments."
GOOD: "Everyone hugs and cries after hating each other for two hours. Zero buildup."

### HARD LIMITS (DO NOT EXCEED)
- headline: 12 words maximum
- content: 150 words maximum total
- internet_vibe: exactly 6 items, 12 words each maximum
- your_opinion: 65 words maximum
- recommendation: exactly 4 items, reason 10 words maximum each

### OUTPUT (JSON)
{
  "headline": "Short and punchy. One main problem.",
  "content": "Brief roast in three tight paragraphs. Blank lines between. Describe what happens, why it sucks.",
  "internet_vibe": ["Six reactions like real comments."],
  "your_opinion": "Direct take on who should watch.",
  "recommendation": ["Movie 1 - why it's better.", "Movie 2 - why it's better.", "Movie 3 - why it's better.", "Movie 4 - why it's better."]
}

If you go over limits, cut content. Be ruthless.`,
			},
			{
				role: 'user',
				content: `
Title: ${facts.title} (${facts.release_date.split('-')[0]})
Stats: ${facts.genres.map((g) => g.name).join('/')} | Rating: ${facts.vote_average} | Runtime: ${facts.runtime} mins
The Gist: ${facts.overview}

Deep Movie Research:
${truth.content}

Based on this research, create a satirical roast that's factually accurate but humorously sharp.
`.trim(),
			},
		],
	};

	const apiStartTime = Date.now();
	const res = await fetch('https://api.x.ai/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.XAI_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	console.log(res);

	const apiDuration = Date.now() - apiStartTime;

	if (!res.ok) {
		const errorText = await res.text();
		await logger.logExternalAPICall(
			'Grok (Roast Generation)',
			{
				movieId: facts.id.toString(),
				movieTitle: facts.title,
				model: 'grok-4-1-fast-reasoning',
				stage: 'roast',
			},
			undefined,
			`${res.status} ${res.statusText}: ${errorText}`,
			apiDuration
		);
		throw new Error(`Grok API failed: ${res.status} ${res.statusText}`);
	}

	const data = (await res.json()) as GrokResponse;

	// Log successful API call
	await logger.logExternalAPICall(
		'Grok (Roast Generation)',
		{
			movieId: facts.id.toString(),
			movieTitle: facts.title,
			model: body.model,
			temperature: body.temperature,
			max_tokens: body.max_tokens,
			stage: 'roast',
		},
		{
			response_length: data.choices[0].message.content.length,
		},
		undefined,
		apiDuration
	);

	return JSON.parse(data.choices[0].message.content);
}

// export async function searchMovieDetails(title: string, releaseYear: string, env: Env) {
// 	const logger = new Logger(env, '/api/grok/search', 'POST');
// 	const body = {
// 		model: 'grok-2-1212',
// 		temperature: 0.7,
// 		max_tokens: 1000,
// 		messages: [
// 			{
// 				role: 'system',
// 				content:
// 					'You are a movie information assistant. Provide detailed, accurate information about movies including box office performance, critical reception, trivia, and cultural impact. Use web search to find the latest information.',
// 			},
// 			{
// 				role: 'user',
// 				content: `Find detailed information about the movie "${title}" (${releaseYear}). Include box office performance, critical reception, awards, interesting trivia, and cultural impact.`,
// 			},
// 		],
// 		tools: [
// 			{
// 				type: 'web_search',
// 			},
// 		],
// 	};

// 	const apiStartTime = Date.now();
// 	const res = await fetch('https://api.x.ai/v1/chat/completions', {
// 		method: 'POST',
// 		headers: {
// 			Authorization: `Bearer ${env.XAI_API_KEY}`,
// 			'Content-Type': 'application/json',
// 		},
// 		body: JSON.stringify(body),
// 	});

// 	const apiDuration = Date.now() - apiStartTime;

// 	if (!res.ok) {
// 		const errorText = await res.text();
// 		await logger.logExternalAPICall(
// 			'Grok (Movie Search)',
// 			{ movie: title, year: releaseYear, model: 'grok-2-1212' },
// 			undefined,
// 			`${res.status} ${res.statusText}: ${errorText}`,
// 			apiDuration
// 		);
// 		throw new Error(`Grok API failed: ${res.status} ${res.statusText}`);
// 	}

// 	const data = (await res.json()) as GrokResponse;

// 	// Log successful API call
// 	await logger.logExternalAPICall(
// 		'Grok (Movie Search)',
// 		{
// 			movie: title,
// 			year: releaseYear,
// 			model: body.model,
// 			with_web_search: true,
// 		},
// 		{
// 			response_length: data.choices[0].message.content.length,
// 		},
// 		undefined,
// 		apiDuration
// 	);

// 	return data.choices[0].message.content;
// }
