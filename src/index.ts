import type { Env } from './types';
import { json } from './utils/response';
import { Logger } from './utils/logger';
import { validateApiKey, isPublicEndpoint } from './utils/auth';
import { handleNowPlaying } from './handlers/nowPlaying';
import { handleMovieRoast } from './handlers/movieRoast';
import { handleClearNowPlayingCache, handleClearRoastCache, handleClearTruthCache, handleClearDebugCache, handleClearAllCache } from './handlers/cache';
import { handleFeed } from './handlers/feed';
import { handleGetLogs, handleClearLogs } from './handlers/logs';
import { handleGetDebug, handleGetDebugByCorrelation } from './handlers/debug';
import { runDailyRoastGeneration, handleCronTrigger, handleCronStatus } from './handlers/cron';

export type { Env };

// ---------------- WORKER ----------------

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(req.url);

		// Generate or extract correlation ID from headers
		const correlationId = req.headers.get('x-correlation-id') || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const logger = new Logger(env, url.pathname, req.method, correlationId);

		try {
			// Check authentication for protected endpoints
			if (!isPublicEndpoint(url.pathname)) {
				const authError = validateApiKey(req, env);
				if (authError) {
					// Don't log 401 responses to avoid KV write delays
					// await logger.logResponse(401, { error: 'Unauthorized' });
					return authError;
				}
			}

			// Log incoming request with minimal metadata
			await logger.logRequest({
				queryParams: Object.fromEntries(url.searchParams),
				userAgent: req.headers.get('user-agent'),
			});

			let response: Response;
			let movieId: string | undefined;
			let movieTitle: string | undefined;

			if (url.pathname === '/now-playing') {
				response = await handleNowPlaying(env);
			} else if (url.pathname === '/feed') {
				response = await handleFeed(env, url.searchParams);
			} else if (url.pathname === '/cron/trigger' && req.method === 'POST') {
				response = await handleCronTrigger(env, ctx);
			} else if (url.pathname === '/cron/status' && req.method === 'GET') {
				response = await handleCronStatus(env);
			} else if (url.pathname === '/logs' && req.method === 'GET') {
				response = await handleGetLogs(env, url.searchParams);
			} else if (url.pathname === '/logs' && req.method === 'DELETE') {
				response = await handleClearLogs(env, url.searchParams);
			} else if (url.pathname === '/debug' && req.method === 'GET') {
				const correlationId = url.searchParams.get('correlationId');
				if (correlationId) {
					response = await handleGetDebugByCorrelation(correlationId, env);
				} else {
					response = json({ error: 'Missing correlationId query parameter' }, 400);
				}
			} else if (req.method === 'DELETE') {
				if (url.pathname === '/cache/clear/now-playing') {
					response = await handleClearNowPlayingCache(env);
				} else if (url.pathname === '/cache/clear/roast') {
					response = await handleClearRoastCache(env);
				} else if (url.pathname === '/cache/clear/truth') {
					response = await handleClearTruthCache(env);
				} else if (url.pathname === '/cache/clear/debug') {
					response = await handleClearDebugCache(env);
				} else if (url.pathname === '/cache/clear/all') {
					response = await handleClearAllCache(env);
				} else {
					response = json({ error: 'Not found' }, 404);
				}
			} else {
				const movieMatch = url.pathname.match(/^\/movie\/(\d+)$/);
				const debugMatch = url.pathname.match(/^\/movie\/(\d+)\/debug$/);

				if (debugMatch) {
					movieId = debugMatch[1];
					response = await handleGetDebug(movieId, env);
				} else if (movieMatch) {
					movieId = movieMatch[1];
					response = await handleMovieRoast(movieId, env, correlationId);
				} else {
					response = json({ error: 'Not found' }, 404);
				}
				// } else {
				// 	const detailsMatch = url.pathname.match(/^\/movie\/(\d+)\/details$/);
				// 	if (detailsMatch) {
				// 		movieId = detailsMatch[1];
				// 		response = await handleMovieDetailsWithSearch(movieId, env, correlationId);
				// 	} else {
				// 		response = json({ error: 'Not found' }, 404);
				// 	}
				// }
			}

			// Log response with important metadata only
			await logger.logResponse(response.status, {
				movieId,
				movieTitle,
			});

			return response;
		} catch (error) {
			// Log error
			await logger.logError(error as Error);

			return json(
				{
					error: 'Internal server error',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		}
	},

	async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
		const correlationId = `cron-${Date.now()}`;
		console.log(`[${correlationId}] Scheduled cron job triggered at ${new Date().toISOString()}`);

		try {
			await runDailyRoastGeneration(env, correlationId);
			console.log(`[${correlationId}] Cron job completed successfully`);
		} catch (error) {
			console.error(`[${correlationId}] Cron job failed:`, error);
			// Don't throw - allow worker to continue
		}
	},
};
