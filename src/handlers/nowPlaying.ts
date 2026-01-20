import type { Env } from '../types';
import { getNowPlayingKey, NOW_PLAYING_TTL } from '../constants';
import { fetchNowPlaying } from '../services/tmdb';
import { json } from '../utils/response';

export async function handleNowPlaying(env: Env) {
	const cacheKey = getNowPlayingKey(env);
	const cached = await env.NOW_PLAYING_KV.get(cacheKey);
	if (cached) {
		return json({ cached: true, ...JSON.parse(cached) });
	}

	const data = await fetchNowPlaying(env);

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

	await env.NOW_PLAYING_KV.put(cacheKey, JSON.stringify(result), {
		expirationTtl: NOW_PLAYING_TTL,
	});

	return json({ cached: false, ...result });
}

// export async function handleTopNowPlaying(env: Env) {
// 	const cached = await env.ROAST_KV.get(NOW_PLAYING_CACHE_KEY);
// 	if (!cached) {
// 		await handleNowPlaying(env);
// 	}

// 	const data = JSON.parse((await env.ROAST_KV.get(NOW_PLAYING_CACHE_KEY))!);

// 	const top = data.movies
// 		.filter((m: any) => m.votes > MIN_VOTES)
// 		.sort((a: any, b: any) => b.popularity - a.popularity)
// 		.slice(0, TOP_N);

// 	return json({ top });
// }

// export async function handleTopNowPlayingRoast(env: Env, handleMovieRoast: (tmdbId: string, env: Env) => Promise<Response>) {
// 	const cached = await env.ROAST_KV.get(NOW_PLAYING_CACHE_KEY);
// 	if (!cached) {
// 		return json({ total: 0, results: [], message: 'Cache not yet populated. Visit /now-playing first.' });
// 	}

// 	const data = JSON.parse(cached);

// 	const topMovies = data.movies
// 		.filter((m: any) => m.votes > MIN_VOTES)
// 		.sort((a: any, b: any) => b.popularity - a.popularity)
// 		.slice(0, TOP_N);

// 	const results: { id: number; status: string }[] = [];

// 	for (const movie of topMovies) {
// 		const kvKey = `roast:v1:movie:${movie.id}`;
// 		const existing = await env.ROAST_KV.get(kvKey);

// 		if (existing) {
// 			results.push({ id: movie.id, status: 'cached' });
// 			continue;
// 		}

// 		try {
// 			await handleMovieRoast(String(movie.id), env);
// 			results.push({ id: movie.id, status: 'generated' });
// 		} catch {
// 			results.push({ id: movie.id, status: 'failed' });
// 		}
// 	}

// 	return json({
// 		total: results.length,
// 		results,
// 	});
// }
