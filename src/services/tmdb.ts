import type { Env, TMDBNowPlayingResponse, TMDBMovieDetails, TMDBCreditsResponse, TMDBWatchProvidersResponse } from '../types';
import { Logger } from '../utils/logger';

// TMDB Genre IDs to exclude (documentaries and music/concert films)
const EXCLUDED_GENRE_IDS = [
	99, // Documentary
	10402, // Music
];

/**
 * Checks if a movie should be excluded based on its genres
 * @param genreIds - Array of TMDB genre IDs
 * @returns true if the movie should be excluded
 */
function isExcludedGenre(genreIds: number[]): boolean {
	return genreIds.some((id) => EXCLUDED_GENRE_IDS.includes(id));
}

/**
 * Checks if a movie's release date falls within PlotBurn's release window:
 * - Between (today - 10 days) and (today - 3 days) in UTC
 * @param dateStr - Release date in YYYY-MM-DD format
 * @returns true if the date is within the release window
 */
function isWithinReleaseWindow(dateStr: string): boolean {
	if (!dateStr) return false;

	const releaseDate = new Date(dateStr + 'T00:00:00Z'); // Parse as UTC midnight
	const now = new Date();

	// Calculate boundaries in UTC
	const tenDaysAgo = new Date(now);
	tenDaysAgo.setUTCDate(now.getUTCDate() - 10);
	tenDaysAgo.setUTCHours(0, 0, 0, 0);

	const threeDaysAgo = new Date(now);
	threeDaysAgo.setUTCDate(now.getUTCDate() - 3);
	threeDaysAgo.setUTCHours(23, 59, 59, 999);

	return releaseDate >= tenDaysAgo && releaseDate <= threeDaysAgo;
}

export async function fetchNowPlaying(env: Env): Promise<TMDBNowPlayingResponse> {
	const logger = new Logger(env, '/api/tmdb/now-playing', 'GET');

	// Fetch first page to get total_pages
	const apiStartTime = Date.now();
	const firstRes = await fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${env.TMDB_API_KEY}&page=1&region=IN`);

	if (!firstRes.ok) {
		const apiDuration = Date.now() - apiStartTime;
		await logger.logExternalAPICall(
			'TMDB (Now Playing)',
			{ endpoint: 'now_playing', page: 1, region: 'IN' },
			undefined,
			`${firstRes.status} ${firstRes.statusText}`,
			apiDuration
		);
		throw new Error('TMDB now_playing failed');
	}

	const firstData = (await firstRes.json()) as TMDBNowPlayingResponse;
	const totalPages = firstData.total_pages;

	// Start with first page results
	let allResults = [...firstData.results];

	// Fetch remaining pages sequentially to avoid rate limits
	for (let page = 2; page <= totalPages; page++) {
		const pageRes = await fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${env.TMDB_API_KEY}&page=${page}&region=IN`);

		if (!pageRes.ok) {
			console.warn(`[TMDB] Failed to fetch page ${page}, skipping`);
			continue;
		}

		const pageData = (await pageRes.json()) as TMDBNowPlayingResponse;
		allResults.push(...pageData.results);
	}

	const totalDuration = Date.now() - apiStartTime;

	console.log(`[TMDB] Fetched ${allResults.length} movies from ${totalPages} pages`);

	// Filter movies to PlotBurn's release window: (today - 10 days) to (today - 3 days)
	// Also exclude documentaries and music/concert films
	const originalCount = allResults.length;
	const filteredResults = allResults.filter(
		(movie) => isWithinReleaseWindow(movie.release_date) && !isExcludedGenre(movie.genre_ids)
	);
	const filteredCount = filteredResults.length;

	// Log filtering stats for monitoring
	console.log(
		`[TMDB] Filtered now-playing movies: ${filteredCount} kept, ${originalCount - filteredCount} removed (release window + genre filter)`
	);

	// Log successful API call with aggregated stats
	await logger.logExternalAPICall(
		'TMDB (Now Playing)',
		{
			endpoint: 'now_playing',
			region: 'IN',
			pages_fetched: totalPages,
		},
		{
			total_movies: originalCount,
			filtered_movies: filteredCount,
			removed_movies: originalCount - filteredCount,
		},
		undefined,
		totalDuration
	);

	// Return a new response object with filtered results and normalized pagination
	return {
		...firstData,
		results: filteredResults,
		total_pages: 1,
		total_results: filteredCount,
	};
}

export async function fetchMovieDetails(tmdbId: string, env: Env, correlationId: string): Promise<TMDBMovieDetails> {
	const logger = new Logger(env, '/api/tmdb/movie-details', 'GET', correlationId);

	const apiStartTime = Date.now();
	const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${env.TMDB_API_KEY}`);

	const apiDuration = Date.now() - apiStartTime;

	if (!res.ok) {
		await logger.logExternalAPICall(
			'TMDB (Movie Details)',
			{ 
				movieId: tmdbId,
				endpoint: 'movie', 
				stage: 'tmdb' 
			},
			undefined,
			`${res.status} ${res.statusText}`,
			apiDuration
		);
		throw new Error('TMDB movie fetch failed');
	}

	const data = (await res.json()) as TMDBMovieDetails;

	// Log successful API call
	await logger.logExternalAPICall(
		'TMDB (Movie Details)',
		{
			movieId: tmdbId,
			movieTitle: data.title,
			endpoint: 'movie',
			stage: 'tmdb',
		},
		{
			release_year: data.release_date.split('-')[0],
			rating: data.vote_average,
		},
		undefined,
		apiDuration
	);

	return data;
}

export async function fetchMovieCredits(tmdbId: string, env: Env, correlationId: string): Promise<TMDBCreditsResponse> {
	const logger = new Logger(env, '/api/tmdb/movie-credits', 'GET', correlationId);

	const apiStartTime = Date.now();
	const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${env.TMDB_API_KEY}`);

	const apiDuration = Date.now() - apiStartTime;

	if (!res.ok) {
		await logger.logExternalAPICall(
			'TMDB (Movie Credits)',
			{
				movieId: tmdbId,
				endpoint: 'credits',
				stage: 'tmdb',
			},
			undefined,
			`${res.status} ${res.statusText}`,
			apiDuration
		);
		throw new Error('TMDB credits fetch failed');
	}

	const data = (await res.json()) as TMDBCreditsResponse;

	// Extract director name(s)
	const directors = data.crew.filter((member) => member.job === 'Director').map((d) => d.name);

	await logger.logExternalAPICall(
		'TMDB (Movie Credits)',
		{
			movieId: tmdbId,
			endpoint: 'credits',
			stage: 'tmdb',
		},
		{
			cast_count: data.cast.length,
			crew_count: data.crew.length,
			directors: directors.join(', '),
		},
		undefined,
		apiDuration
	);

	return data;
}

export async function fetchWatchProviders(tmdbId: string, env: Env, correlationId: string): Promise<TMDBWatchProvidersResponse> {
	const logger = new Logger(env, '/api/tmdb/watch-providers', 'GET', correlationId);

	const apiStartTime = Date.now();
	const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers?api_key=${env.TMDB_API_KEY}`);

	const apiDuration = Date.now() - apiStartTime;

	if (!res.ok) {
		await logger.logExternalAPICall(
			'TMDB (Watch Providers)',
			{
				movieId: tmdbId,
				endpoint: 'watch/providers',
				stage: 'tmdb',
			},
			undefined,
			`${res.status} ${res.statusText}`,
			apiDuration
		);
		// Return empty-ish response on failure to not break flow? Or throw?
		// Throwing is better so we know it failed, but caller should handle.
		throw new Error('TMDB watch providers fetch failed');
	}

	const data = (await res.json()) as TMDBWatchProvidersResponse;

	await logger.logExternalAPICall(
		'TMDB (Watch Providers)',
		{
			movieId: tmdbId,
			endpoint: 'watch/providers',
			stage: 'tmdb',
		},
		{
			regions_count: Object.keys(data.results).length,
			has_in: !!data.results['IN'],
		},
		undefined,
		apiDuration
	);

	return data;
}

export async function fetchPopularMovies(env: Env): Promise<TMDBNowPlayingResponse> {
	const logger = new Logger(env, '/api/tmdb/popular', 'GET');

	const apiStartTime = Date.now();
	
	// Fetch 1 page only (20 results)
	const res = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${env.TMDB_API_KEY}&page=1&region=IN`);
	
	if (!res.ok) {
		const apiDuration = Date.now() - apiStartTime;
		await logger.logExternalAPICall(
			'TMDB (Popular Movies)',
			{ endpoint: 'popular', region: 'IN', page: 1 },
			undefined,
			`${res.status} ${res.statusText}`,
			apiDuration
		);
		throw new Error('TMDB popular fetch failed');
	}

	const data = (await res.json()) as TMDBNowPlayingResponse;
	const apiDuration = Date.now() - apiStartTime;

	// Log the operation
	await logger.logExternalAPICall(
		'TMDB (Popular Movies)',
		{ endpoint: 'popular', region: 'IN', page: 1 },
		{ count: data.results.length },
		undefined,
		apiDuration
	);

	// Return top 20 popular movies
	return {
		page: 1,
		results: data.results.slice(0, 20),
		total_pages: 1,
		total_results: data.results.length,
		dates: { maximum: '', minimum: '' } // Not applicable for popular
	};
}
