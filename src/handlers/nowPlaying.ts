import type { Env, NowPlayingMovie, TMDBNowPlayingMovie } from '../types';
import { fetchNowPlaying } from '../services/tmdb';
import { upsertMovie, addMovieToCategory, clearCategory } from '../services/database';
import { json } from '../utils/response';

export async function handleNowPlaying(env: Env): Promise<Response> {
	console.log('[NOW_PLAYING] Fetching from TMDB...');

	// Fetch from TMDB
	const data = await fetchNowPlaying(env);

	// Save movies to D1 (source of truth) - WITHOUT updating popularity
	console.log(`[NOW_PLAYING] Saving ${data.results.length} movies to D1...`);

	// Clear existing now_playing category before refreshing
	await clearCategory(env, 'now_playing');

	let savedCount = 0;
	let failedCount = 0;

	for (const movie of data.results) {
		try {
			// Convert TMDBNowPlayingMovie to TMDBMovieDetails format for upsert
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
				// Default values for fields not in now-playing response
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

			// Pass skipPopularity=true to avoid overwriting popularity if it differs
			try {
				await upsertMovie(env, movieDetails, 'en', true);
			} catch (upsertError) {
				console.error(`[NOW_PLAYING] Failed to upsert movie ${movie.id} (${movie.title}):`, upsertError);
				throw upsertError; // Re-throw to catch in outer block
			}
			
			// Add to 'now_playing' category
			try {
				await addMovieToCategory(env, movie.id, 'now_playing');
			} catch (categoryError) {
				console.error(`[NOW_PLAYING] Failed to add movie ${movie.id} (${movie.title}) to category:`, categoryError);
				throw categoryError; // Re-throw to catch in outer block
			}
			
			savedCount++;
		} catch (error) {
			failedCount++;
			console.error(`[NOW_PLAYING] Failed to save movie ${movie.id} (${movie.title}):`, error);
			// Continue with other movies even if one fails
		}
	}

	console.log(`[NOW_PLAYING] D1 save complete: ${savedCount} saved, ${failedCount} failed`);

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
		has_roast: false, // Will be updated when roasts are generated
	}));

	return json({
		cached: false,
		page: data.page,
		total_pages: data.total_pages,
		total_results: data.total_results,
		dates: data.dates,
		movies,
	});
}
