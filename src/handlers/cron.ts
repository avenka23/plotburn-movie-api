import type { Env, CronResult, NowPlayingResponse, MovieRoastResponse, NowPlayingMovie } from '../types';
import { handleNowPlaying } from './nowPlaying';
import { handlePopularMovies } from './popular';
import { handleMovieRoast } from './movieRoast';
import { json } from '../utils/response';
import { Logger } from '../utils/logger';
import { CRON_DELAY_MS } from '../constants';

/**
 * Main cron job logic - fetches now-playing movies and generates roasts for each
 * @param env - Cloudflare environment bindings
 * @param correlationId - Unique ID for this cron run
 * @returns CronResult with execution summary
 */
export async function runDailyRoastGeneration(env: Env, correlationId: string): Promise<CronResult> {
	const startTime = Date.now();
	const logger = new Logger(env, '/cron/run', 'SCHEDULED', correlationId);
	let finalStatus = 200;

	await logger.logRequest({ trigger: correlationId.startsWith('cron-') ? 'scheduled' : 'manual' });

	try {
		// Step 1: Fetch now-playing movies
		console.log(`[${correlationId}] Fetching now-playing movies...`);
		const nowPlayingResponse = await handleNowPlaying(env);
		const nowPlayingData = (await nowPlayingResponse.json()) as NowPlayingResponse;
		const nowPlayingMovies = nowPlayingData.movies;
		console.log(`[${correlationId}] Found ${nowPlayingMovies.length} now-playing movies`);

		// Step 2: Fetch popular movies
		console.log(`[${correlationId}] Fetching popular movies...`);
		const popularResponse = await handlePopularMovies(env);
		const popularData = (await popularResponse.json()) as NowPlayingResponse;
		const popularMovies = popularData.movies;
		console.log(`[${correlationId}] Found ${popularMovies.length} popular movies`);

		// Step 3: Merge and deduplicate (popular movies take precedence for duplicates)
		const movieMap = new Map<number, NowPlayingMovie>();

		// Add now-playing first
		for (const movie of nowPlayingMovies) {
			movieMap.set(movie.id, movie);
		}

		// Add popular movies (overwrites duplicates - popular score takes precedence)
		for (const movie of popularMovies) {
			movieMap.set(movie.id, movie);
		}

		const movies = Array.from(movieMap.values());
		const duplicateCount = nowPlayingMovies.length + popularMovies.length - movies.length;
		console.log(`[${correlationId}] Merged: ${movies.length} unique movies (${duplicateCount} duplicates removed)`);

		// Step 4: Process each movie sequentially with rate limiting
		const results = {
			processed: 0,
			cached: 0,
			generated: 0,
			failed: 0,
			failedIds: [] as number[],
		};

		for (let i = 0; i < movies.length; i++) {
			const movie = movies[i];
			const movieId = String(movie.id);

			try {
				console.log(`[${correlationId}] Processing movie ${i + 1}/${movies.length}: ${movie.title} (ID: ${movieId})`);

				const roastResponse = await handleMovieRoast(movieId, env, correlationId);
				const roastData = (await roastResponse.json()) as MovieRoastResponse;

				results.processed++;

				if (roastData.cached) {
					results.cached++;
					console.log(`[${correlationId}] ✓ Roast cached for ${movie.title}`);
				} else {
					results.generated++;
					console.log(`[${correlationId}] ✓ Generated new roast for ${movie.title}`);
				}

				// Add delay between movies to avoid rate limits (except after last movie)
				if (i < movies.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, CRON_DELAY_MS));
				}
			} catch (error) {
				results.failed++;
				results.failedIds.push(movie.id);
				console.error(`[${correlationId}] ✗ Failed to process ${movie.title}:`, error);

				// Continue processing even if one movie fails
				// Add delay before next movie
				if (i < movies.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, CRON_DELAY_MS));
				}
			}
		}

		// Step 5: Create result summary
		const cronResult: CronResult = {
			timestamp: new Date().toISOString(),
			trigger: correlationId.startsWith('cron-') ? 'scheduled' : 'manual',
			correlation_id: correlationId,
			movies_fetched: movies.length,
			roasts_processed: results.processed,
			roasts_cached: results.cached,
			roasts_generated: results.generated,
			roasts_failed: results.failed,
			failed_movie_ids: results.failedIds,
			duration_ms: Date.now() - startTime,
			status: results.failed === 0 ? 'success' : results.generated > 0 ? 'partial' : 'failed',
		};

		console.log(`[${correlationId}] Cron job completed:`, cronResult);

		// Step 6: Log completion
		await logger.logResponse(200, cronResult);

		return cronResult;
	} catch (error) {
		finalStatus = 500;
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[${correlationId}] Cron job failed:`, error);

		await logger.logResponse(500, { error: errorMessage });

		throw error;
	} finally {
		// Always flush logs to R2
		await logger.flush(finalStatus);
	}
}

/**
 * Manual trigger endpoint - allows triggering cron job via API
 * POST /cron/trigger
 *
 * Returns immediately with a correlation ID, and runs the cron job in the background.
 * Use GET /cron/status to check the result.
 */
export async function handleCronTrigger(env: Env, ctx?: ExecutionContext): Promise<Response> {
	const correlationId = `manual-trigger-${Date.now()}`;

	console.log(`[${correlationId}] Manual cron trigger initiated`);

	// If ExecutionContext is provided, run in background
	if (ctx) {
		// Start the cron job in the background
		ctx.waitUntil(
			runDailyRoastGeneration(env, correlationId).catch((error) => {
				console.error(`[${correlationId}] Background cron execution failed:`, error);
			})
		);

		// Return immediately
		return json(
			{
				message: 'Cron job started in background',
				correlation_id: correlationId,
				status: 'started',
				check_status_at: '/cron/status',
			},
			202 // 202 Accepted - request accepted but processing not complete
		);
	}

	// Fallback: synchronous execution (for testing without ExecutionContext)
	try {
		console.log(`[${correlationId}] Running cron job synchronously (no ExecutionContext)`);
		const result = await runDailyRoastGeneration(env, correlationId);
		return json(result, 200);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return json({ error: 'Cron execution failed', message: errorMessage }, 500);
	}
}

/**
 * Status endpoint - returns note about KV removal
 * GET /cron/status
 */
export async function handleCronStatus(env: Env): Promise<Response> {
	return json(
		{
			message: "Cron status history is no longer stored in KV. Check server logs."
		},
		200
	);
}
