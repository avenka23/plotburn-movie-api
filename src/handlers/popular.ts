import type { Env, NowPlayingMovie, TMDBNowPlayingMovie } from '../types';
import { fetchPopularMovies } from '../services/tmdb';
import { upsertMovie } from '../services/database';
import { json } from '../utils/response';

export async function handlePopularMovies(env: Env): Promise<Response> {
	console.log('[POPULAR] Fetching from TMDB...');

	// Fetch from TMDB (always fresh - popularity scores change frequently)
	const data = await fetchPopularMovies(env);

	// Save movies to D1 (source of truth) with updated popularity scores
	console.log(`[POPULAR] Saving ${data.results.length} movies to D1...`);

	const successfulMovieIds: number[] = [];

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

			await upsertMovie(env, movieDetails, 'en', false);
			successfulMovieIds.push(movie.id);
		} catch (error) {
			console.error(`[POPULAR] Failed to upsert movie ${movie.id} (${movie.title}):`, error);
		}
	}

	// Atomically refresh category: clear old entries and insert new ones in a single batch
	const now = Math.floor(Date.now() / 1000);
	await env.plotburn_db.batch([
		env.plotburn_db.prepare('DELETE FROM movie_categories WHERE category = ?').bind('popular'),
		...successfulMovieIds.map(id =>
			env.plotburn_db.prepare('INSERT OR IGNORE INTO movie_categories (movie_id, category, added_at) VALUES (?, ?, ?)').bind(id, 'popular', now)
		),
	]);

	console.log(`[POPULAR] D1 save complete: ${successfulMovieIds.length} saved, ${data.results.length - successfulMovieIds.length} failed`);

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
