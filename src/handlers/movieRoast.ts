import type { Env, MovieMeta } from '../types';
import { getRoastKey, ROAST_TTL, getDebugKey, DEBUG_TTL, getTruthKey } from '../constants';
import { fetchMovieDetails } from '../services/tmdb';
import { getOrCreateMovieTruth } from '../services/brave';
import { generateRoast } from '../services/claude';
import { json } from '../utils/response';

export async function handleMovieTruth(tmdbId: string, env: Env, correlationId: string) {
	const kvKey = getTruthKey(env, tmdbId);

	// Check if truth already exists
	const cached = await env.TRUTH_KV.get(kvKey, { type: 'json' });
	if (cached) {
		return json({ cached: true, ...cached });
	}

	// Fetch movie metadata from TMDB
	const movie = await fetchMovieDetails(tmdbId, env, correlationId);

	const movieMeta: MovieMeta = {
		adult: movie.adult,
		backdrop_path: movie.backdrop_path,
		belongs_to_collection: movie.belongs_to_collection,
		budget: movie.budget,
		genres: movie.genres,
		homepage: movie.homepage,
		id: movie.id,
		imdb_id: movie.imdb_id,
		origin_country: movie.origin_country,
		original_language: movie.original_language,
		original_title: movie.original_title,
		overview: movie.overview,
		popularity: movie.popularity,
		poster_path: movie.poster_path,
		production_companies: movie.production_companies,
		production_countries: movie.production_countries,
		release_date: movie.release_date,
		revenue: movie.revenue,
		runtime: movie.runtime,
		spoken_languages: movie.spoken_languages,
		status: movie.status,
		tagline: movie.tagline,
		title: movie.title,
		video: movie.video,
		vote_average: movie.vote_average,
		vote_count: movie.vote_count,
	};

	// Get or create movie truth from Brave Search
	const truth = await getOrCreateMovieTruth(tmdbId, movieMeta, env, correlationId);

	return json({
		cached: false,
		movie: {
			id: movie.id,
			title: movie.title,
			release_date: movie.release_date,
		},
		truth,
	});
}

export async function handleMovieRoast(tmdbId: string, env: Env, correlationId: string) {
	const kvKey = getRoastKey(env, tmdbId);

	// Check if roast already exists
	const cached = await env.ROAST_KV.get(kvKey);
	if (cached) {
		return json({ cached: true, ...JSON.parse(cached) });
	}

	// Fetch basic movie metadata from TMDB
	const movie = await fetchMovieDetails(tmdbId, env, correlationId);

	console.log(JSON.stringify(movie));

	const movieMeta: MovieMeta = {
		adult: movie.adult,
		backdrop_path: movie.backdrop_path,
		belongs_to_collection: movie.belongs_to_collection,
		budget: movie.budget,
		genres: movie.genres,
		homepage: movie.homepage,
		id: movie.id,
		imdb_id: movie.imdb_id,
		origin_country: movie.origin_country,
		original_language: movie.original_language,
		original_title: movie.original_title,
		overview: movie.overview,
		popularity: movie.popularity,
		poster_path: movie.poster_path,
		production_companies: movie.production_companies,
		production_countries: movie.production_countries,
		release_date: movie.release_date,
		revenue: movie.revenue,
		runtime: movie.runtime,
		spoken_languages: movie.spoken_languages,
		status: movie.status,
		tagline: movie.tagline,
		title: movie.title,
		video: movie.video,
		vote_average: movie.vote_average,
		vote_count: movie.vote_count,
	};

	// Step 1: Get or create movie truth from Brave Search (cache-first)
	const truth = await getOrCreateMovieTruth(tmdbId, movieMeta, env, correlationId);

	console.log();

	// Step 2: Generate satire using the truth data
	const roast = await generateRoast(movieMeta, truth, env, correlationId);

	// Step 3: Store roast in ROAST_KV
	const result = {
		movie: movieMeta,
		roast,
		generated_at: new Date().toISOString(),
		disclaimer: 'Satire. Facts unchanged.',
		truth_source: truth.source,
		truth_fetched_at: truth.fetchedAt,
	};

	await env.ROAST_KV.put(kvKey, JSON.stringify(result), {
		expirationTtl: ROAST_TTL,
	});

	const debugPayload = {
		movie,
		movieMeta,
		truth,
		roast,
		result,
		correlationId,
		timestamp: new Date().toISOString(),
	};

	// Store debug payload in DEBUG_KV indexed by movieId (30 day TTL)
	await env.DEBUG_KV.put(getDebugKey(env, tmdbId, correlationId), JSON.stringify(debugPayload), {
		expirationTtl: DEBUG_TTL,
	});

	return json({ cached: false, ...result });
}

// export async function handleMovieDetailsWithSearch(tmdbId: string, env: Env, correlationId: string) {

// 	const movie = await fetchMovieDetails(tmdbId, env, correlationId);

// 	const additionalInfo = await searchMovieDetails(movie.title, movie.release_date.split('-')[0], env);

// 	return json({
// 		movie: {
// 			id: movie.id,
// 			title: movie.title,
// 			original_title: movie.original_title,
// 			release_date: movie.release_date,
// 			overview: movie.overview,
// 			tagline: movie.tagline,
// 			runtime: movie.runtime,
// 			genres: movie.genres,
// 			budget: movie.budget,
// 			revenue: movie.revenue,
// 			status: movie.status,
// 			vote_average: movie.vote_average,
// 			vote_count: movie.vote_count,
// 		},
// 		additional_info: additionalInfo,
// 		source: 'TMDB + Grok Web Search',
// 	});
// }
