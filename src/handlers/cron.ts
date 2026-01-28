import type { Env, CronResult, NowPlayingResponse, NowPlayingMovie } from '../types';
import { handleNowPlaying } from './nowPlaying';
import { handlePopularMovies } from './popular';
import { json } from '../utils/response';
import { Logger } from '../utils/logger';
import { CronTracker } from '../services/cron';

/**
 * Main cron job logic - fetches now-playing movies and generates roasts for each
 * @param env - Cloudflare environment bindings
 * @param correlationId - Unique ID for this cron run (used for logging)
 * @returns CronResult with execution summary
 */
export async function runDailyRoastGeneration(env: Env, correlationId: string): Promise<CronResult> {
	const startTime = Date.now();
	const logger = new Logger(env, '/cron/run', 'SCHEDULED', correlationId);
	const tracker = new CronTracker(env, 'movie_roast');
	let runId: number | null = null;
	let finalStatus = 200;

	await logger.logRequest({ trigger: correlationId.startsWith('cron-') ? 'scheduled' : 'manual' });

	try {
		// 0. Acquire Lock & Start Run
		try {
			console.log(`[${correlationId}] Attempting to acquire cron lock...`);
			runId = await tracker.startRun();
			console.log(`[${correlationId}] Acquired lock for run #${runId}`);
		} catch (e: any) {
			if (e.message.includes('already running')) {
				console.warn(`[${correlationId}] Skipping run: ${e.message}`);
				// Log this as a special "skipped" event rather than a full error
				await logger.logWarn('Cron execution skipped: Job already running');
				// DO NOT set runId here - no lock was acquired, nothing to release
				return {
					timestamp: new Date().toISOString(),
					trigger: correlationId.startsWith('cron-') ? 'scheduled' : 'manual',
					correlation_id: correlationId,
					status: 'skipped',
					duration_ms: Date.now() - startTime,
					error: 'Job is already running'
				};
			}
			throw e;
		}

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

		// Step 4: Send movies to queue for parallel processing
		console.log(`[${correlationId}] Sending ${movies.length} movies to queue...`);

		// Cloudflare Queues limits sendBatch to 100 messages per call
		const QUEUE_BATCH_SIZE = 100;
		for (let i = 0; i < movies.length; i += QUEUE_BATCH_SIZE) {
			const chunk = movies.slice(i, i + QUEUE_BATCH_SIZE);
			await env.MOVIE_QUEUE.sendBatch(
				chunk.map(movie => ({
					body: {
						movieId: movie.id,
						title: movie.title,
						correlationId,
					}
				}))
			);
		}

		console.log(`[${correlationId}] Queued ${movies.length} movies for processing`);

		// Update tracking
		if (runId) {
			await tracker.updateProgress(runId, movies.map(m => m.title), movies.length);
		}

		// Step 5: Create result summary
		const cronResult: CronResult = {
			timestamp: new Date().toISOString(),
			trigger: correlationId.startsWith('cron-') ? 'scheduled' : 'manual',
			correlation_id: correlationId,
			movies_fetched: movies.length,
			movies_queued: movies.length,
			duration_ms: Date.now() - startTime,
			status: 'success',
		};

		console.log(`[${correlationId}] Cron job completed:`, cronResult);

		// Complete run in DB
		if (runId) {
			await tracker.completeRun(runId, null);
		}

		// Step 6: Log completion
		await logger.logResponse(200, cronResult);

		return cronResult;
	} catch (error) {
		finalStatus = 500;
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[${correlationId}] Cron job failed:`, error);
		
		// Fail run in DB
		if (runId) {
			await tracker.failRun(runId, error);
		}

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
 * Status endpoint - returns recent runs from D1
 * GET /cron/status
 */
export async function handleCronStatus(env: Env): Promise<Response> {
	try {
		const tracker = new CronTracker(env, 'movie_roast');
		const history = await tracker.getHistory(20);
		
		return json({
			job: 'movie_roast',
			runs: history
		}, 200);
	} catch (error) {
		console.error('[CronStatus] Failed to fetch history:', error);
		return json({ error: 'Failed to fetch cron history' }, 500);
	}
}
