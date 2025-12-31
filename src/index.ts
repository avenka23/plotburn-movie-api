export interface Env {
	TMDB_API_KEY: string;
	XAI_API_KEY: string;
	ROAST_KV: KVNamespace;
}

// ---------------- CONSTANTS ----------------

const NOW_PLAYING_CACHE_KEY = 'now-playing:v1';
const NOW_PLAYING_TTL = 23 * 60 * 60; // 23 hours
const TOP_N = 2;
const MIN_VOTES = 50;

// ---------------- TMDB TYPES ----------------

// NOW PLAYING
type TMDBNowPlayingResponse = {
	dates: { maximum: string; minimum: string };
	page: number;
	results: TMDBNowPlayingMovie[];
	total_pages: number;
	total_results: number;
};

type TMDBNowPlayingMovie = {
	id: number;
	title: string;
	original_title: string;
	release_date: string;
	overview: string;
	popularity: number;
	poster_path: string | null;
	genre_ids: number[];
	vote_average: number;
	vote_count: number;
};

// MOVIE DETAILS
type TMDBMovieDetails = {
	id: number;
	title: string;
	original_title: string;
	release_date: string;
	overview: string;
	tagline: string | null;
	runtime: number;
	genres: { id: number; name: string }[];
	budget: number;
	revenue: number;
	status: string;
	vote_average: number;
	vote_count: number;
};

// ---------------- WORKER ----------------

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);

		if (url.pathname === '/now-playing') {
			return handleNowPlaying(env);
		}

		if (url.pathname === '/top-now-playing') {
			return handleTopNowPlaying(env);
		}

		if (url.pathname === '/top-now-playing/roast') {
			return handleTopNowPlayingRoast(env);
		}

		const match = url.pathname.match(/^\/movie\/(\d+)$/);
		if (match) {
			return handleMovieRoast(match[1], env);
		}

		if (url.pathname === '/feed') {
			return handleFeed(env);
		}

		return json({ error: 'Not found' }, 404);
	},
};

// ---------------- HANDLERS ----------------

// 1️⃣ NOW PLAYING (23h CACHE)
async function handleNowPlaying(env: Env) {
	const cached = await env.ROAST_KV.get(NOW_PLAYING_CACHE_KEY);
	if (cached) {
		return json({ cached: true, ...JSON.parse(cached) });
	}

	const res = await fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${env.TMDB_API_KEY}`);

	if (!res.ok) {
		return json({ error: 'TMDB now_playing failed' }, 500);
	}

	const data = (await res.json()) as TMDBNowPlayingResponse;

	const movies = data.results.map((m) => ({
		id: m.id,
		title: m.title,
		release_date: m.release_date,
		rating: m.vote_average,
		votes: m.vote_count,
		popularity: m.popularity,
		overview: m.overview,
		poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
		has_roast: false,
	}));

	const result = {
		page: data.page,
		total_pages: data.total_pages,
		total_results: data.total_results,
		dates: data.dates,
		movies,
	};

	await env.ROAST_KV.put(NOW_PLAYING_CACHE_KEY, JSON.stringify(result), {
		expirationTtl: NOW_PLAYING_TTL,
	});

	return json({ cached: false, ...result });
}

// 2️⃣ TOP NOW PLAYING (LIST ONLY)
async function handleTopNowPlaying(env: Env) {
	const cached = await env.ROAST_KV.get(NOW_PLAYING_CACHE_KEY);
	if (!cached) {
		await handleNowPlaying(env);
	}

	const data = JSON.parse((await env.ROAST_KV.get(NOW_PLAYING_CACHE_KEY))!);

	const top = data.movies
		.filter((m: any) => m.votes > MIN_VOTES)
		.sort((a: any, b: any) => b.popularity - a.popularity)
		.slice(0, TOP_N);

	return json({ top });
}

// 3️⃣ TOP NOW PLAYING ROAST (BATCH)
async function handleTopNowPlayingRoast(env: Env) {
	const cached = await env.ROAST_KV.get(NOW_PLAYING_CACHE_KEY);
	if (!cached) {
		return json({ error: 'now-playing cache missing' }, 400);
	}

	const data = JSON.parse(cached);

	const topMovies = data.movies
		.filter((m: any) => m.votes > MIN_VOTES)
		.sort((a: any, b: any) => b.popularity - a.popularity)
		.slice(0, TOP_N);

	const results: { id: number; status: string }[] = [];

	for (const movie of topMovies) {
		const kvKey = `roast:v1:movie:${movie.id}`;
		const existing = await env.ROAST_KV.get(kvKey);

		if (existing) {
			results.push({ id: movie.id, status: 'cached' });
			continue;
		}

		try {
			await handleMovieRoast(String(movie.id), env);
			results.push({ id: movie.id, status: 'generated' });
		} catch {
			results.push({ id: movie.id, status: 'failed' });
		}
	}

	return json({
		total: results.length,
		results,
	});
}

// 4️⃣ SINGLE MOVIE ROAST
async function handleMovieRoast(tmdbId: string, env: Env) {
	const kvKey = `roast:v1:movie:${tmdbId}`;

	const cached = await env.ROAST_KV.get(kvKey);
	if (cached) {
		return json({ cached: true, ...JSON.parse(cached) });
	}

	const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${env.TMDB_API_KEY}`);

	if (!res.ok) {
		return json({ error: 'TMDB movie fetch failed' }, 500);
	}

	const movie = (await res.json()) as TMDBMovieDetails;

	const facts = {
		id: movie.id,
		title: movie.title,
		release_year: movie.release_date.split('-')[0],
		rating: movie.vote_average,
		votes: movie.vote_count,
		runtime: movie.runtime,
		genres: movie.genres.map((g) => g.name),
		overview: movie.overview,
		tagline: movie.tagline,
		budget: movie.budget,
		revenue: movie.revenue,
		status: movie.status,
	};

	const roast = await generateRoast(facts, env);

	const result = {
		movie: facts,
		roast,
		generated_at: new Date().toISOString(),
		disclaimer: 'Satire. Facts unchanged.',
	};

	await env.ROAST_KV.put(kvKey, JSON.stringify(result), {
		expirationTtl: 60 * 60 * 24 * 30,
	});

	return json({ cached: false, ...result });
}

// 5️⃣ ROAST GENERATOR (SOFT TONE)
async function generateRoast(facts: any, env: Env) {
	const body = {
		model: 'grok-4-1-fast-non-reasoning',
		temperature: 0.85,
		max_tokens: 250,
		messages: [
			{
				role: 'system',
				content: `
You are a clever, dry satire writer for PlotBurn.
Mock the movie, the effort, or the premise — not the audience.
Be sharp but playful, not hostile.
Use simple, witty English.
Do NOT invent facts.
Return ONLY valid JSON with "headline" and "body".
        `.trim(),
			},
			{
				role: 'user',
				content: `
Title: ${facts.title}
Release year: ${facts.release_year}
Rating: ${facts.rating}
Votes: ${facts.votes}
Runtime: ${facts.runtime}
Genres: ${facts.genres.join(', ')}
Overview: ${facts.overview}
        `.trim(),
			},
		],
	};

	const res = await fetch('https://api.x.ai/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.XAI_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	const data = (await res.json()) as {
		choices: { message: { content: string } }[];
	};

	return JSON.parse(data.choices[0].message.content);
}

// ================= FEED ENDPOINT =================
// Returns Top N movies WITH roasts (read-only, no generation)

async function handleFeed(env: Env) {
	const cached = await env.ROAST_KV.get(NOW_PLAYING_CACHE_KEY);
	if (!cached) {
		return json({ error: 'now-playing cache missing' }, 400);
	}

	const data = JSON.parse(cached);

	const topMovies = data.movies
		.filter((m: any) => m.votes > MIN_VOTES)
		.sort((a: any, b: any) => b.popularity - a.popularity)
		.slice(0, TOP_N);

	const feed = [];

	for (const movie of topMovies) {
		const kvKey = `roast:v1:movie:${movie.id}`;
		const roastRaw = await env.ROAST_KV.get(kvKey);

		if (!roastRaw) {
			// roast not generated yet → skip (or mark pending)
			continue;
		}

		const roastData = JSON.parse(roastRaw);

		feed.push({
			id: movie.id,
			title: movie.title,
			release_date: movie.release_date,
			rating: movie.rating,
			votes: movie.votes,
			popularity: movie.popularity,
			poster_url: movie.poster_url,
			roast: roastData.roast,
			generated_at: roastData.generated_at,
		});
	}

	return json({
		total: feed.length,
		feed,
	});
}

// ---------------- HELPER ----------------

function json(data: any, status = 200) {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
