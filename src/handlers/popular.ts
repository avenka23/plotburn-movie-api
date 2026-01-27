import type { Env, NowPlayingMovie, TMDBNowPlayingMovie } from '../types';
import { fetchPopularMovies } from '../services/tmdb';
import { upsertMovie, addMovieToCategory, clearCategory } from '../services/database';
import { json } from '../utils/response';

export async function handlePopularMovies(env: Env): Promise<Response> {
	console.log('[POPULAR] Fetching from TMDB...');

	// Fetch from TMDB (always fresh - popularity scores change frequently)
	const data = await fetchPopularMovies(env);

	// Save movies to D1 (source of truth) with updated popularity scores
	console.log(`[POPULAR] Saving ${data.results.length} movies to D1...`);

	// Clear existing popular category before refreshing
	await clearCategory(env, 'popular');

	let savedCount = 0;
	let failedCount = 0;

	for (const movie of data.results) {
		try {
			const movieDetails = {
				id: movie.id,
				title: movie.title,
				original_title: movie.original_title,
				release_date: movie.release_date,
				popularity: movie.popularity,
				vote_average: movie.vote_average,
				vote_count: movie.vote_count,
				poster_path: movie.poster_path,
				overview: movie.overview,
				// Default values for fields not in popular response
				adult: false,
				backdrop_path: null,
				belongs_to_collection: null,
				budget: 0,
				genres: [],
				homepage: '',
				imdb_id: null,
				origin_country: [],
				original_language: '',
				production_companies: [],
				production_countries: [],
				revenue: 0,
				runtime: 0,
				spoken_languages: [],
				status: 'Released',
				tagline: '',
				video: false,
			};

			// skipPopularity=false to always update popularity scores
			try {
				await upsertMovie(env, movieDetails, 'en', false);
			} catch (upsertError) {
				console.error(`[POPULAR] Failed to upsert movie ${movie.id} (${movie.title}):`, upsertError);
				throw upsertError; // Re-throw to catch in outer block
			}
			
			// Add to 'popular' category
			try {
				await addMovieToCategory(env, movie.id, 'popular');
			} catch (categoryError) {
				console.error(`[POPULAR] Failed to add movie ${movie.id} (${movie.title}) to category:`, categoryError);
				throw categoryError; // Re-throw to catch in outer block
			}
			
			savedCount++;
		} catch (error) {
			failedCount++;
			console.error(`[POPULAR] Failed to save movie ${movie.id} (${movie.title}):`, error);
			// Continue with other movies
		}
	}

	console.log(`[POPULAR] D1 save complete: ${savedCount} saved, ${failedCount} failed`);

	// Transform to response format
	const movies: NowPlayingMovie[] = data.results.map((movie: TMDBNowPlayingMovie) => ({
		id: movie.id,
		title: movie.title,
		release_date: movie.release_date,
		rating: movie.vote_average,
		votes: movie.vote_count,
		popularity: movie.popularity,
		overview: movie.overview,
		poster_url: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
		has_roast: false,
	}));

	return json({
		cached: false,
		page: data.page,
		total_pages: data.total_pages,
		total_results: data.total_results,
		movies,
	});
}
