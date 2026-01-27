import type { Env, TMDBMovieDetails, MovieRoast, StreamingProviderDB } from '../types';

// ============= TYPE DEFINITIONS =============

export interface DBMovie {
	id: number;
	title: string;
	release_date: string | null;
	popularity: number | null;
	vote_average: number | null;
	vote_count: number | null;
	poster_path: string | null;
	language: string; // ISO 639-1 code
	created_at: number;
	updated_at: number;
	categories?: string[]; // Populated via JOIN
}

export interface DBExtraction {
	id: number;
	movie_id: number;
	source: string;
	model: string;
	fetched_at: number;
	content_json: string; // JSON string of GrokExtractionResponse
	evidence_json: string; // JSON string of Brave search data
	citations_json: string | null; // JSON array of URLs
	prompt_tokens: number | null;
	completion_tokens: number | null;
	total_tokens: number | null;
	total_cost: number | null;
}

export interface DBRoast {
	id: number; // Auto-increment ID for versioning
	movie_id: number;
	roast_json: string; // JSON string of MovieRoast
	language: string; // ISO 639-1 code
	created_at: number;
	is_featured: number; // 0 or 1 (SQLite boolean)
	is_active: number; // 0 or 1 (soft versioning)
}

// ============= MOVIE OPERATIONS =============

/**
 * Insert or update a movie in the database
 */
export async function upsertMovie(env: Env, movie: TMDBMovieDetails, language: string = 'en', skipPopularity: boolean = false): Promise<void> {
	const now = Math.floor(Date.now() / 1000);

	await env.plotburn_db
		.prepare(
			`INSERT INTO movies (id, title, release_date, popularity, vote_average, vote_count, poster_path, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         release_date = excluded.release_date,
         vote_average = excluded.vote_average,
         vote_count = excluded.vote_count,
         poster_path = excluded.poster_path,
         language = excluded.language,
         updated_at = excluded.updated_at,
         popularity = CASE WHEN ? = 1 THEN popularity ELSE excluded.popularity END`
		)
		.bind(
			movie.id,
			movie.title,
			movie.release_date || null,
			movie.popularity || null,
			movie.vote_average || null,
			movie.vote_count || null,
			movie.poster_path || null,
			language,
			now,
			now,
			skipPopularity ? 1 : 0
		)
		.run();
}

/**
 * Add a movie to a category (many-to-many relationship)
 */
export async function addMovieToCategory(env: Env, movieId: number, category: string): Promise<void> {
	const now = Math.floor(Date.now() / 1000);

	console.log(`[DB] Adding movie ${movieId} to category '${category}'`);
	
	const result = await env.plotburn_db
		.prepare(
			`INSERT OR IGNORE INTO movie_categories (movie_id, category, added_at)
       VALUES (?, ?, ?)`
		)
		.bind(movieId, category, now)
		.run();
	
	console.log(`[DB] Inserted into movie_categories: success=${result.success}, changes=${result.meta.changes}, movieId=${movieId}, category=${category}`);
}

/**
 * Clear all movies from a category (used before refreshing category membership)
 */
export async function clearCategory(env: Env, category: string): Promise<void> {
	console.log(`[DB] Clearing category '${category}'...`);
	
	const result = await env.plotburn_db
		.prepare(`DELETE FROM movie_categories WHERE category = ?`)
		.bind(category)
		.run();
	
	console.log(`[DB] Cleared category '${category}': success=${result.success}, changes=${result.meta.changes}`);
}

/**
 * Reset popularity to 0 for all movies in a specific category
 */
export async function resetCategoryPopularity(env: Env, category: string): Promise<void> {
	await env.plotburn_db
		.prepare(
			`UPDATE movies 
       SET popularity = 0 
       WHERE id IN (SELECT movie_id FROM movie_categories WHERE category = ?)`
		)
		.bind(category)
		.run();
}

/**
 * Get a movie by ID with its categories (single query using GROUP_CONCAT)
 */
export async function getMovie(env: Env, movieId: number): Promise<DBMovie | null> {
	const result = await env.plotburn_db
		.prepare(
			`SELECT
         m.id, m.title, m.release_date, m.popularity, m.vote_average, m.vote_count,
         m.poster_path, m.language, m.created_at, m.updated_at,
         GROUP_CONCAT(mc.category) as categories_csv
       FROM movies m
       LEFT JOIN movie_categories mc ON m.id = mc.movie_id
       WHERE m.id = ?
       GROUP BY m.id`
		)
		.bind(movieId)
		.first<DBMovie & { categories_csv: string | null }>();

	if (!result) return null;

	// Parse categories from comma-separated string
	const movie: DBMovie = {
		id: result.id,
		title: result.title,
		release_date: result.release_date,
		popularity: result.popularity,
		vote_average: result.vote_average,
		vote_count: result.vote_count,
		poster_path: result.poster_path,
		language: result.language,
		created_at: result.created_at,
		updated_at: result.updated_at,
		categories: result.categories_csv ? result.categories_csv.split(',') : [],
	};

	return movie;
}

/**
 * Get movies by category with pagination
 */
export async function getMoviesByCategory(
	env: Env,
	category: string,
	limit: number = 20,
	offset: number = 0
): Promise<{ movies: DBMovie[]; total: number }> {
	// Get total count
	const countResult = await env.plotburn_db
		.prepare(`SELECT COUNT(*) as count FROM movie_categories WHERE category = ?`)
		.bind(category)
		.first<{ count: number }>();

	const total = countResult?.count || 0;

	// Get movies
	const moviesResult = await env.plotburn_db
		.prepare(
			`SELECT m.id, m.title, m.release_date, m.popularity, m.vote_average, m.vote_count, m.poster_path, m.language, m.created_at, m.updated_at
       FROM movies m
       INNER JOIN movie_categories mc ON m.id = mc.movie_id
       WHERE mc.category = ?
       ORDER BY mc.added_at DESC
       LIMIT ? OFFSET ?`
		)
		.bind(category, limit, offset)
		.all<DBMovie>();

	return {
		movies: moviesResult.results,
		total,
	};
}

/**
 * Get all movies with pagination
 */
export async function getAllMovies(
	env: Env,
	limit: number = 20,
	offset: number = 0
): Promise<{ movies: DBMovie[]; total: number }> {
	// Get total count
	const countResult = await env.plotburn_db
		.prepare(`SELECT COUNT(*) as count FROM movies`)
		.first<{ count: number }>();

	const total = countResult?.count || 0;

	// Get movies
	const moviesResult = await env.plotburn_db
		.prepare(
			`SELECT id, title, release_date, popularity, vote_average, vote_count, poster_path, language, created_at, updated_at
       FROM movies
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
		)
		.bind(limit, offset)
		.all<DBMovie>();

	return {
		movies: moviesResult.results,
		total,
	};
}

// ============= EXTRACTION OPERATIONS =============

/**
 * Insert a new extraction record
 */
export async function insertExtraction(
	env: Env,
	movieId: number,
	extraction: {
		source: string;
		model: string;
		content: any; // Will be stringified
		evidence: any; // Will be stringified
		citations: string[];
		usage: {
			prompt_tokens: number;
			completion_tokens: number;
			total_tokens: number;
			total_cost: number;
		};
	}
): Promise<number> {
	const now = Math.floor(Date.now() / 1000);

	const result = await env.plotburn_db
		.prepare(
			`INSERT INTO extractions (movie_id, source, model, fetched_at, content_json, evidence_json, citations_json, prompt_tokens, completion_tokens, total_tokens, total_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			movieId,
			extraction.source,
			extraction.model,
			now,
			JSON.stringify(extraction.content),
			JSON.stringify(extraction.evidence),
			JSON.stringify(extraction.citations),
			extraction.usage.prompt_tokens,
			extraction.usage.completion_tokens,
			extraction.usage.total_tokens,
			extraction.usage.total_cost
		)
		.run();

	return result.meta.last_row_id || 0;
}

/**
 * Get the latest extraction for a movie
 */
export async function getLatestExtraction(env: Env, movieId: number): Promise<DBExtraction | null> {
	const result = await env.plotburn_db
		.prepare(
			`SELECT id, movie_id, source, model, fetched_at, content_json, evidence_json, citations_json, prompt_tokens, completion_tokens, total_tokens, total_cost
       FROM extractions
       WHERE movie_id = ?
       ORDER BY fetched_at DESC
       LIMIT 1`
		)
		.bind(movieId)
		.first<DBExtraction>();

	return result || null;
}

/**
 * Get all extractions for a movie
 */
export async function getExtractionsByMovie(env: Env, movieId: number): Promise<DBExtraction[]> {
	const result = await env.plotburn_db
		.prepare(
			`SELECT id, movie_id, source, model, fetched_at, content_json, evidence_json, citations_json, prompt_tokens, completion_tokens, total_tokens, total_cost
       FROM extractions
       WHERE movie_id = ?
       ORDER BY fetched_at DESC`
		)
		.bind(movieId)
		.all<DBExtraction>();

	return result.results;
}

/**
 * Get all extractions with pagination
 */
export async function getAllExtractions(
	env: Env,
	limit: number = 20,
	offset: number = 0
): Promise<{ extractions: DBExtraction[]; total: number }> {
	// Get total count
	const countResult = await env.plotburn_db
		.prepare(`SELECT COUNT(*) as count FROM extractions`)
		.first<{ count: number }>();

	const total = countResult?.count || 0;

	// Get extractions
	const extractionsResult = await env.plotburn_db
		.prepare(
			`SELECT id, movie_id, source, model, fetched_at, content_json, evidence_json, citations_json, prompt_tokens, completion_tokens, total_tokens, total_cost
       FROM extractions
       ORDER BY fetched_at DESC
       LIMIT ? OFFSET ?`
		)
		.bind(limit, offset)
		.all<DBExtraction>();

	return {
		extractions: extractionsResult.results,
		total,
	};
}

// ============= ROAST OPERATIONS =============

/**
 * Deactivate all existing roasts for a movie+language before inserting new one
 */
async function deactivateOldRoasts(env: Env, movieId: number, language: string = 'en'): Promise<void> {
	await env.plotburn_db
		.prepare(
			`UPDATE roasts 
       SET is_active = 0 
       WHERE movie_id = ? AND language = ? AND is_active = 1`
		)
		.bind(movieId, language)
		.run();
}

/**
 * Insert a new roast for a movie (with soft versioning)
 * Deactivates previous roasts for the same movie+language
 */
export async function upsertRoast(env: Env, movieId: number, roast: MovieRoast, language: string = 'en'): Promise<number> {
	const now = Math.floor(Date.now() / 1000);

	// Deactivate old roasts for this movie+language
	await deactivateOldRoasts(env, movieId, language);

	// Insert new active roast
	const result = await env.plotburn_db
		.prepare(
			`INSERT INTO roasts (movie_id, roast_json, language, created_at, is_featured, is_active)
       VALUES (?, ?, ?, ?, 0, 1)`
		)
		.bind(movieId, JSON.stringify(roast), language, now)
		.run();

	return result.meta.last_row_id || 0;
}

/**
 * Get the active roast for a movie+language
 */
export async function getActiveRoast(env: Env, movieId: number, language: string = 'en'): Promise<DBRoast | null> {
	const result = await env.plotburn_db
		.prepare(
			`SELECT id, movie_id, roast_json, language, created_at, is_featured, is_active
       FROM roasts
       WHERE movie_id = ? AND language = ? AND is_active = 1`
		)
		.bind(movieId, language)
		.first<DBRoast>();

	return result || null;
}

/**
 * Get a roast by movie ID (returns active roast, backward compatible)
 */
export async function getRoast(env: Env, movieId: number, language: string = 'en'): Promise<DBRoast | null> {
	return getActiveRoast(env, movieId, language);
}

/**
 * Get all roast versions for a movie (including inactive)
 */
export async function getRoastHistory(env: Env, movieId: number, language: string = 'en'): Promise<DBRoast[]> {
	const result = await env.plotburn_db
		.prepare(
			`SELECT id, movie_id, roast_json, language, created_at, is_featured, is_active
       FROM roasts
       WHERE movie_id = ? AND language = ?
       ORDER BY created_at DESC`
		)
		.bind(movieId, language)
		.all<DBRoast>();

	return result.results;
}

/**
 * Get all roasts with pagination
 */
export async function getAllRoasts(
	env: Env,
	limit: number = 20,
	offset: number = 0
): Promise<{ roasts: DBRoast[]; total: number }> {
	// Get total count
	const countResult = await env.plotburn_db.prepare(`SELECT COUNT(*) as count FROM roasts`).first<{ count: number }>();

	const total = countResult?.count || 0;

	// Get roasts
	const roastsResult = await env.plotburn_db
		.prepare(
			`SELECT id, movie_id, roast_json, language, created_at, is_featured, is_active
       FROM roasts
       WHERE is_active = 1
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
		)
		.bind(limit, offset)
		.all<DBRoast>();

	return {
		roasts: roastsResult.results,
		total,
	};
}

/**
 * Get roasts with movie details (JOIN)
 */
export async function getRoastsWithMovies(
	env: Env,
	limit: number = 20,
	offset: number = 0
): Promise<{
	results: Array<{
		movie: DBMovie;
		roast: DBRoast;
	}>;
	total: number;
}> {
	// Get total count (only active roasts to match data query)
	const countResult = await env.plotburn_db.prepare(`SELECT COUNT(*) as count FROM roasts WHERE is_active = 1`).first<{ count: number }>();

	const total = countResult?.count || 0;

	// Get roasts with movie data
	const roastsResult = await env.plotburn_db
		.prepare(
			`SELECT 
         r.id, r.movie_id, r.roast_json, r.language, r.created_at, r.is_featured, r.is_active,
         m.title, m.release_date, m.popularity, m.vote_average, m.vote_count, m.poster_path, m.language as movie_language, m.created_at as movie_created_at, m.updated_at
       FROM roasts r
       INNER JOIN movies m ON r.movie_id = m.id
       WHERE r.is_active = 1
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`
		)
		.bind(limit, offset)
		.all<any>();

	const results = roastsResult.results.map((row) => ({
		movie: {
			id: row.movie_id,
			title: row.title,
			release_date: row.release_date,
			popularity: row.popularity,
			vote_average: row.vote_average,
			vote_count: row.vote_count,
			poster_path: row.poster_path,
			language: row.movie_language,
			created_at: row.movie_created_at,
			updated_at: row.updated_at,
		},
		roast: {
			id: row.id,
			movie_id: row.movie_id,
			roast_json: row.roast_json,
			language: row.language,
			created_at: row.created_at,
			is_featured: row.is_featured,
			is_active: row.is_active,
		},
	}));

	return { results, total };
}

/**
 * Toggle featured status for a roast by ID
 */
export async function toggleRoastFeatured(env: Env, roastId: number): Promise<void> {
	await env.plotburn_db
		.prepare(
			`UPDATE roasts 
       SET is_featured = CASE WHEN is_featured = 1 THEN 0 ELSE 1 END
       WHERE id = ?`
		)
		.bind(roastId)
		.run();
}

// ============= STREAMING PROVIDER OPERATIONS =============

/**
 * Save streaming providers for a movie in a specific region
 * Deletes existing providers for this movie+region before inserting new ones
 */
export async function saveStreamingProviders(
	env: Env,
	movieId: number,
	region: string,
	providers: Omit<StreamingProviderDB, 'id' | 'last_updated'>[]
): Promise<void> {
	const now = Math.floor(Date.now() / 1000);

	// 1. Delete existing providers for this movie and region
	await env.plotburn_db
		.prepare(`DELETE FROM streaming_providers WHERE tmdb_movie_id = ? AND region = ?`)
		.bind(movieId, region)
		.run();

	if (providers.length === 0) return;

	// 2. Insert new providers
	const stmt = env.plotburn_db.prepare(
		`INSERT INTO streaming_providers (tmdb_movie_id, region, provider_id, provider_name, logo_path, type, link, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	);

	const batch = providers.map((p) =>
		stmt.bind(
			p.tmdb_movie_id,
			p.region,
			p.provider_id,
			p.provider_name,
			p.logo_path,
			p.type,
			p.link,
			now
		)
	);

	await env.plotburn_db.batch(batch);
}

/**
 * Get extractions with movie details (JOIN)
 */
export async function getExtractionsWithMovies(
	env: Env,
	limit: number = 20,
	offset: number = 0
): Promise<{
	results: Array<{
		movie: DBMovie;
		extraction: DBExtraction;
	}>;
	total: number;
}> {
	// Get total count
	const countResult = await env.plotburn_db.prepare(`SELECT COUNT(*) as count FROM extractions`).first<{ count: number }>();

	const total = countResult?.count || 0;

	// Get extractions with movie data
	const extractionsResult = await env.plotburn_db
		.prepare(
			`SELECT 
         e.id, e.movie_id, e.source, e.model, e.fetched_at, e.content_json, e.evidence_json, e.citations_json, e.prompt_tokens, e.completion_tokens, e.total_tokens, e.total_cost,
         m.title, m.release_date, m.popularity, m.vote_average, m.vote_count, m.poster_path, m.language as movie_language, m.created_at as movie_created_at, m.updated_at
       FROM extractions e
       INNER JOIN movies m ON e.movie_id = m.id
       ORDER BY e.fetched_at DESC
       LIMIT ? OFFSET ?`
		)
		.bind(limit, offset)
		.all<any>();

	const results = extractionsResult.results.map((row) => ({
		movie: {
			id: row.movie_id,
			title: row.title,
			release_date: row.release_date,
			popularity: row.popularity,
			vote_average: row.vote_average,
			vote_count: row.vote_count,
			poster_path: row.poster_path,
			language: row.movie_language,
			created_at: row.movie_created_at,
			updated_at: row.updated_at,
		},
		extraction: {
			id: row.id,
			movie_id: row.movie_id,
			source: row.source,
			model: row.model,
			fetched_at: row.fetched_at,
			content_json: row.content_json,
			evidence_json: row.evidence_json,
			citations_json: row.citations_json,
			prompt_tokens: row.prompt_tokens,
			completion_tokens: row.completion_tokens,
			total_tokens: row.total_tokens,
			total_cost: row.total_cost,
		},
	}));

	return { results, total };
}

/**
 * Get movies with their active roast and latest extraction (for All feed)
 * Filtered by category (default 'now_playing')
 */
export async function getMoviesWithRoastAndTruth(
	env: Env,
	category: string = 'now_playing',
	limit: number = 20,
	offset: number = 0
): Promise<{
	results: Array<DBMovie & {
		roast: DBRoast | null;
		truth: DBExtraction | null;
	}>;
	total: number;
}> {
	// Get total count
	const countResult = await env.plotburn_db
		.prepare(`SELECT COUNT(*) as count FROM movie_categories WHERE category = ?`)
		.bind(category)
		.first<{ count: number }>();

	const total = countResult?.count || 0;

	// Complex query to get movie + active roast + latest extraction
	// Using derived table for latest extraction (more efficient than correlated subquery)
	const result = await env.plotburn_db
		.prepare(
			`SELECT
         m.*,
         r.id as roast_id, r.roast_json, r.language as roast_language, r.created_at as roast_created_at, r.is_featured, r.is_active,
         e.id as truth_id, e.source as truth_source, e.model as truth_model, e.fetched_at as truth_fetched_at, e.content_json as truth_content_json
       FROM movies m
       INNER JOIN movie_categories mc ON m.id = mc.movie_id
       LEFT JOIN roasts r ON m.id = r.movie_id AND r.is_active = 1
       LEFT JOIN (
           SELECT movie_id, MAX(fetched_at) as max_fetched_at
           FROM extractions
           GROUP BY movie_id
       ) latest_e ON m.id = latest_e.movie_id
       LEFT JOIN extractions e ON m.id = e.movie_id AND e.fetched_at = latest_e.max_fetched_at
       WHERE mc.category = ?
       ORDER BY mc.added_at DESC
       LIMIT ? OFFSET ?`
		)
		.bind(category, limit, offset)
		.all<any>();

	const results = result.results.map((row) => {
		const movie: DBMovie = {
			id: row.id,
			title: row.title,
			release_date: row.release_date,
			popularity: row.popularity,
			vote_average: row.vote_average,
			vote_count: row.vote_count,
			poster_path: row.poster_path,
			language: row.language,
			created_at: row.created_at,
			updated_at: row.updated_at,
		};

		const roast = row.roast_id ? {
			id: row.roast_id,
			movie_id: row.id,
			roast_json: row.roast_json,
			language: row.roast_language,
			created_at: row.roast_created_at,
			is_featured: row.is_featured,
			is_active: row.is_active,
		} : null;

		const truth = row.truth_id ? {
			id: row.truth_id,
			movie_id: row.id,
			source: row.truth_source,
			model: row.truth_model,
			fetched_at: row.truth_fetched_at,
			content_json: row.truth_content_json,
			evidence_json: '', // Minimize data transfer
			citations_json: '[]',
			prompt_tokens: 0,
			completion_tokens: 0,
			total_tokens: 0,
			total_cost: 0,
		} : null;

		return {
			...movie,
			roast,
			truth,
		};
	});

	return { results, total };
}

