import type { Env, MovieMeta, MovieTruth, ExtractedMovieData } from '../types';
import { fetchMovieDetails, fetchWatchProviders } from '../services/tmdb';
import { fetchBraveSearch, extractWithGrok, StoredSearchResult } from '../services/brave';
import { generateRoast } from '../services/claude';
import { json } from '../utils/response';
import { Logger } from '../utils/logger';
import {
	getLatestExtraction,
	getMovie,
	getRoast,
	upsertMovie,
	upsertRoast,
	insertExtraction,
	saveStreamingProviders,
	DBExtraction,
} from '../services/database';

/**
 * Builds a MovieTruth object from a DB extraction record
 */
function buildMovieTruthFromExtraction(dbExtraction: DBExtraction): MovieTruth {
	return {
		source: dbExtraction.source,
		fetchedAt: new Date(dbExtraction.fetched_at * 1000).toISOString(),
		model: dbExtraction.model,
		costEstimateINR: 0,
		citations: dbExtraction.citations_json ? JSON.parse(dbExtraction.citations_json) : [],
		content: dbExtraction.content_json,
		usage: {
			prompt_tokens: dbExtraction.prompt_tokens || 0,
			completion_tokens: dbExtraction.completion_tokens || 0,
			total_tokens: dbExtraction.total_tokens || 0,
			total_cost: dbExtraction.total_cost || 0,
		},
	};
}

/**
 * Checks if evidence_json is valid (not empty/null)
 */
function hasValidEvidence(dbExtraction: DBExtraction | null): boolean {
	if (!dbExtraction) return false;
	if (!dbExtraction.evidence_json) return false;
	try {
		const parsed = JSON.parse(dbExtraction.evidence_json);
		// Check if it has actual data
		return parsed && (parsed.results?.length > 0 || parsed.faq?.length > 0 || parsed.infobox);
	} catch {
		return false;
	}
}

/**
 * Checks if content_json is valid (not empty/null)
 */
function hasValidContent(dbExtraction: DBExtraction | null): boolean {
	if (!dbExtraction) return false;
	if (!dbExtraction.content_json) return false;
	try {
		const parsed = JSON.parse(dbExtraction.content_json);
		// Check if it has actual extracted data
		return parsed && (parsed.title || parsed.plot || parsed.reception);
	} catch {
		return false;
	}
}

export async function handleMovieTruth(tmdbId: string, env: Env, correlationId: string) {
	// 1. Get from D1 first
	const dbExtraction = await getLatestExtraction(env, parseInt(tmdbId));

	if (dbExtraction && dbExtraction.content_json) {
		const truth = buildMovieTruthFromExtraction(dbExtraction);
		return json({
			cached: true,
			tmdbId,
			truth,
		});
	}

	// 2. If not in DB, fetch metadata and generate
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

	// Generate truth using the orchestration logic
	const truth = await getOrCreateTruth(tmdbId, movieMeta, env, correlationId);

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

/**
 * Orchestrates the extraction flow:
 * 1. Query DB for extraction once
 * 2. If evidence is missing → fetch Brave search
 * 3. If content is missing → call Grok extraction
 * 4. Store new extraction if anything was fetched
 */
async function getOrCreateTruth(
	tmdbId: string,
	movieMeta: MovieMeta,
	env: Env,
	correlationId: string
): Promise<MovieTruth> {
	const logger = new Logger(env, '/api/movie-truth', 'GET', correlationId);

	// 1. Query DB for existing extraction (single query)
	const dbExtraction = await getLatestExtraction(env, parseInt(tmdbId));

	const hasEvidence = hasValidEvidence(dbExtraction);
	const hasContent = hasValidContent(dbExtraction);

	// 2. If we have everything, return cached
	if (hasEvidence && hasContent && dbExtraction) {
		console.log(`[EXTRACTION] Using cached extraction for movie ${tmdbId}`);
		return buildMovieTruthFromExtraction(dbExtraction);
	}

	// 3. Determine what we need to fetch
	let evidence: ExtractedMovieData | null = null;
	let searchResult: StoredSearchResult | null = null;
	let citations: string[] = [];

	// If we have cached evidence, use it
	if (hasEvidence && dbExtraction) {
		console.log(`[EXTRACTION] Using cached evidence for movie ${tmdbId}`);
		evidence = JSON.parse(dbExtraction.evidence_json);
		citations = dbExtraction.citations_json ? JSON.parse(dbExtraction.citations_json) : [];
		// Build a minimal search result for Grok
		searchResult = {
			source: 'brave-search-api',
			fetchedAt: new Date(dbExtraction.fetched_at * 1000).toISOString(),
			query: '',
			data: evidence!,
			citations,
		};
	} else {
		// Fetch fresh evidence from Brave
		console.log(`[EXTRACTION] Fetching Brave search for movie ${tmdbId}`);
		const braveResult = await fetchBraveSearch(tmdbId, movieMeta, env, logger);
		searchResult = braveResult.searchResult;
		evidence = searchResult.data;
		citations = searchResult.citations;
	}

	// 4. Determine if we need to extract content
	let extraction: any = null;
	let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, total_cost: 0 };

	if (hasContent && dbExtraction) {
		// Use cached content
		console.log(`[EXTRACTION] Using cached content for movie ${tmdbId}`);
		extraction = JSON.parse(dbExtraction.content_json);
		usage = {
			prompt_tokens: dbExtraction.prompt_tokens || 0,
			completion_tokens: dbExtraction.completion_tokens || 0,
			total_tokens: dbExtraction.total_tokens || 0,
			total_cost: dbExtraction.total_cost || 0,
		};
	} else {
		// Extract content using Grok
		console.log(`[EXTRACTION] Calling Grok extraction for movie ${tmdbId}`);
		const grokResult = await extractWithGrok(searchResult!, movieMeta, env, logger);
		extraction = grokResult.extraction;
		usage = {
			prompt_tokens: grokResult.usage.prompt_tokens,
			completion_tokens: grokResult.usage.completion_tokens,
			total_tokens: grokResult.usage.total_tokens,
			total_cost: 0,
		};
	}

	// 5. If we fetched anything new, store in DB
	if (!hasEvidence || !hasContent) {
		console.log(`[EXTRACTION] Storing new extraction for movie ${tmdbId}`);
		await insertExtraction(env, parseInt(tmdbId), {
			source: 'grok-extraction',
			model: 'grok-4-1-fast-non-reasoning',
			content: extraction,
			evidence: evidence,
			citations,
			usage,
		});
	}

	// 6. Build and return MovieTruth
	return {
		source: 'grok-extraction',
		fetchedAt: new Date().toISOString(),
		model: 'grok-4-1-fast-non-reasoning',
		costEstimateINR: 0,
		citations,
		content: JSON.stringify(extraction, null, 2),
		usage: {
			prompt_tokens: usage.prompt_tokens,
			completion_tokens: usage.completion_tokens,
			total_tokens: usage.total_tokens,
			tool_calls: 0,
			total_cost: usage.total_cost,
		},
	};
}

export async function handleMovieRoast(tmdbId: string, env: Env, correlationId: string) {
	// 1. Check D1 for existing roast (source of truth)
	const dbRoast = await getRoast(env, parseInt(tmdbId));

	if (dbRoast && dbRoast.is_active) {
		// Reconstruct response from D1
		const dbMovie = await getMovie(env, parseInt(tmdbId));
		const roast = JSON.parse(dbRoast.roast_json);

		const result = {
			movie: dbMovie,
			roast,
			generated_at: new Date(dbRoast.created_at * 1000).toISOString(),
			disclaimer: 'Satire. Facts unchanged.',
			truth_source: 'grok-extraction',
			truth_fetched_at: new Date(dbRoast.created_at * 1000).toISOString(),
		};

		return json({ cached: true, ...result });
	}

	// 2. No D1 roast record - generate new roast
	// Fetch basic movie metadata from TMDB
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

	// 3. Save movie to D1
	await upsertMovie(env, movie, 'en', true);

	// 4. Fetch and Save Watch Providers (IN)
	try {
		const watchProviders = await fetchWatchProviders(tmdbId, env, correlationId);
		if (watchProviders.results['IN'] && watchProviders.results['IN'].flatrate) {
			const providersToSave = watchProviders.results['IN'].flatrate.map((p) => ({
				tmdb_movie_id: parseInt(tmdbId),
				region: 'IN',
				provider_id: p.provider_id,
				provider_name: p.provider_name,
				logo_path: p.logo_path,
				type: 'flatrate',
				link: watchProviders.results['IN'].link,
			}));
			await saveStreamingProviders(env, parseInt(tmdbId), 'IN', providersToSave);
			console.log(`[WATCH_PROVIDERS] Saved ${providersToSave.length} providers for movie ${tmdbId}`);
		}
	} catch (err) {
		console.error(`[WATCH_PROVIDERS] Failed to fetch/save providers for ${tmdbId}:`, err);
		// Swallow error to not block roasting
	}

	// 5. Get or create movie truth (single DB query, conditional API calls)
	const truth = await getOrCreateTruth(tmdbId, movieMeta, env, correlationId);

	// 6. Generate satire using the truth data
	const roast = await generateRoast(movieMeta, truth, env, correlationId);

	// 7. Build result
	const result = {
		movie: movieMeta,
		roast,
		generated_at: new Date().toISOString(),
		disclaimer: 'Satire. Facts unchanged.',
		truth_source: truth.source,
		truth_fetched_at: truth.fetchedAt,
	};

	// 8. Store roast in D1 (source of truth)
	await upsertRoast(env, movie.id, roast);

	return json({ cached: false, ...result });
}
