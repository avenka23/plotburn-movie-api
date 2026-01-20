import type { Env } from '../types';
import { getNowPlayingKey, getRoastKey, getTruthKey, getRoastPrefix, getTruthPrefix } from '../constants';
import { json } from '../utils/response';

/**
 * Feed endpoint with multiple modes:
 * - /feed?type=now-playing&page=1&limit=10 - Get now-playing movies with pagination
 * - /feed?type=roast&page=1&limit=10 - Get all roasted movies with pagination
 * - /feed?type=truth&page=1&limit=10 - Get all truth data with pagination
 * - /feed?type=all&page=1&limit=10 - Get all data (now-playing + roasts + truth) with pagination
 * - /feed?id=123&type=roast - Get specific movie roast by ID
 * - /feed?id=123&type=truth - Get specific movie truth by ID
 */
export async function handleFeed(env: Env, searchParams: URLSearchParams) {
	const type = searchParams.get('type') || 'all';
	const movieId = searchParams.get('id');
	const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
	const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10', 10)));

	// If specific movie ID is requested
	if (movieId) {
		return handleSpecificMovie(movieId, type, env);
	}

	// Handle paginated feeds
	switch (type) {
		case 'now-playing':
			return handleNowPlayingFeed(env);
		case 'roast':
			return handleRoastFeed(env, page, limit);
		case 'truth':
			return handleTruthFeed(env, page, limit);
		case 'all':
			return handleAllFeed(env, page, limit);
		default:
			return json({ error: 'Invalid type. Use: now-playing, roast, truth, or all' }, 400);
	}
}

async function handleSpecificMovie(movieId: string, type: string, env: Env) {
	if (type === 'roast') {
		const roastKey = getRoastKey(env, movieId);
		const roastRaw = await env.ROAST_KV.get(roastKey);

		if (!roastRaw) {
			return json({ error: 'Roast not found for this movie' }, 404);
		}

		return json(JSON.parse(roastRaw));
	}

	if (type === 'truth') {
		const truthKey = getTruthKey(env, movieId);
		const truthRaw = await env.TRUTH_KV.get(truthKey);

		if (!truthRaw) {
			return json({ error: 'Truth data not found for this movie' }, 404);
		}

		return json(JSON.parse(truthRaw));
	}

	return json({ error: 'Invalid type for specific movie. Use: roast or truth' }, 400);
}

async function handleNowPlayingFeed(env: Env) {
	const cacheKey = getNowPlayingKey(env);
	const cached = await env.NOW_PLAYING_KV.get(cacheKey);
	if (!cached) {
		return json({ error: 'Now-playing cache not populated yet' }, 404);
	}

	const data = JSON.parse(cached);
	return json({
		type: 'now-playing',
		total: data.total_results,
		movies: data.movies,
		dates: data.dates,
	});
}

async function handleRoastFeed(env: Env, page: number, limit: number) {
	const prefix = getRoastPrefix(env);
	const listResult = await env.ROAST_KV.list({ prefix });
	const totalCount = listResult.keys.length;
	const startIdx = (page - 1) * limit;
	const endIdx = startIdx + limit;
	const pageKeys = listResult.keys.slice(startIdx, endIdx);

	const roasts = [];
	for (const key of pageKeys) {
		const roastRaw = await env.ROAST_KV.get(key.name);
		if (roastRaw) {
			roasts.push(JSON.parse(roastRaw));
		}
	}

	return json({
		type: 'roast',
		page,
		limit,
		total: totalCount,
		total_pages: Math.ceil(totalCount / limit),
		results: roasts,
	});
}

async function handleTruthFeed(env: Env, page: number, limit: number) {
	const prefix = getTruthPrefix(env);
	const listResult = await env.TRUTH_KV.list({ prefix });
	const totalCount = listResult.keys.length;
	const startIdx = (page - 1) * limit;
	const endIdx = startIdx + limit;
	const pageKeys = listResult.keys.slice(startIdx, endIdx);

	const truths = [];
	for (const key of pageKeys) {
		const truthRaw = await env.TRUTH_KV.get(key.name);
		if (truthRaw) {
			truths.push(JSON.parse(truthRaw));
		}
	}

	return json({
		type: 'truth',
		page,
		limit,
		total: totalCount,
		total_pages: Math.ceil(totalCount / limit),
		results: truths,
	});
}

async function handleAllFeed(env: Env, page: number, limit: number) {
	// Get now-playing data
	const cacheKey = getNowPlayingKey(env);
	const nowPlayingCached = await env.NOW_PLAYING_KV.get(cacheKey);
	const nowPlayingData = nowPlayingCached ? JSON.parse(nowPlayingCached) : null;

	// Get all movies from now-playing (already filtered by date)
	const allMovies = nowPlayingData ? nowPlayingData.movies : [];

	// Get roasts and truths for all movies
	const feed = [];
	for (const movie of allMovies) {
		const roastKey = getRoastKey(env, String(movie.id));
		const truthKey = getTruthKey(env, String(movie.id));

		const [roastRaw, truthRaw] = await Promise.all([env.ROAST_KV.get(roastKey), env.TRUTH_KV.get(truthKey)]);

		const roast = roastRaw ? JSON.parse(roastRaw) : null;
		const truth = truthRaw ? JSON.parse(truthRaw) : null;

		feed.push({
			...movie,
			roast: roast?.roast || null,
			roast_generated_at: roast?.generated_at || null,
			truth: truth?.content || null,
			truth_fetched_at: truth?.fetchedAt || null,
		});
	}

	// Pagination
	const startIdx = (page - 1) * limit;
	const endIdx = startIdx + limit;
	const paginatedFeed = feed.slice(startIdx, endIdx);

	return json({
		type: 'all',
		page,
		limit,
		total: feed.length,
		total_pages: Math.ceil(feed.length / limit),
		results: paginatedFeed,
	});
}
