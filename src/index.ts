import type { Env } from './types';
import { json } from './utils/response';
import { Logger } from './utils/logger';
import { validateApiKey, isPublicEndpoint } from './utils/auth';
import { handleNowPlaying } from './handlers/nowPlaying';
import { handlePopularMovies } from './handlers/popular';
import { handleMovieRoast, handleMovieTruth } from './handlers/movieRoast';
import { runDailyRoastGeneration, handleCronTrigger, handleCronStatus } from './handlers/cron';

export type { Env };

// ---------------- WORKER ----------------

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(req.url);

		// Generate or extract correlation ID from headers
		const correlationId = req.headers.get('x-correlation-id') || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const logger = new Logger(env, url.pathname, req.method, correlationId);

		let responseStatus = 200;

		try {
			// Check authentication for protected endpoints
			if (!isPublicEndpoint(url.pathname)) {
				const authError = validateApiKey(req, env);
				if (authError) {
					responseStatus = 401;
					await logger.logResponse(401, { error: 'Unauthorized' });
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
			} else if (url.pathname === '/popular') {
				response = await handlePopularMovies(env);
			} else if (url.pathname === '/cron/trigger' && req.method === 'POST') {
				response = await handleCronTrigger(env, ctx);
			} else if (url.pathname === '/cron/status' && req.method === 'GET') {
				response = await handleCronStatus(env);
			} else {
				const movieMatch = url.pathname.match(/^\/movie\/(\d+)$/);
				const truthMatch = url.pathname.match(/^\/movie\/(\d+)\/truth$/);

				if (truthMatch) {
					movieId = truthMatch[1];
					response = await handleMovieTruth(movieId, env, correlationId);
				} else if (movieMatch) {
					movieId = movieMatch[1];
					response = await handleMovieRoast(movieId, env, correlationId);
				} else {
					response = json({ error: 'Not found' }, 404);
				}
			}

			responseStatus = response.status;

			// Log response with important metadata only
			await logger.logResponse(response.status, {
				movieId,
				movieTitle,
			});

			return response;
		} catch (error) {
			responseStatus = 500;
			// Log error
			await logger.logError(error as Error);

			return json(
				{
					error: 'Internal server error',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			);
		} finally {
			// Always flush logs to R2 at the end of the request
			// This ensures all accumulated logs are persisted even if an error occurred
			ctx.waitUntil(logger.flush(responseStatus));
		}
	},

	async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
		const correlationId = `cron-${Date.now()}`;
		const logger = new Logger(env, '/cron/scheduled', 'SCHEDULED', correlationId);

		let status = 200;

		try {
			await logger.logRequest({ trigger: 'scheduled', cron: event.cron });
			await runDailyRoastGeneration(env, correlationId);
			await logger.logResponse(200, { status: 'completed' });
		} catch (error) {
			status = 500;
			await logger.logError(error as Error);
			// Don't throw - allow worker to continue
		} finally {
			// Flush logs to R2
			await logger.flush(status);
		}
	},
};
