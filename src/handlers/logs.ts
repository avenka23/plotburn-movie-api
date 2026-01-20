import type { Env } from '../types';
import { getLogs, clearOldLogs, type LogLevel } from '../utils/logger';
import { json } from '../utils/response';

/**
 * Logs endpoint:
 * - GET /logs?limit=100&level=ERROR - Get logs with optional filtering
 * - DELETE /logs?olderThanDays=30 - Manually clear old logs (TTL handles this automatically)
 */
export async function handleGetLogs(env: Env, searchParams: URLSearchParams) {
	const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get('limit') || '100', 10)));
	const level = (searchParams.get('level') as LogLevel) || undefined;
	const correlationId = searchParams.get('correlationId') || undefined;

	const logs = await getLogs(env, { limit, level });

	// Filter by correlation ID if provided
	const filteredLogs = correlationId
		? logs.filter((log) => log.metadata?.correlationId === correlationId)
		: logs;

	return json({
		total: filteredLogs.length,
		logs: filteredLogs,
		note: `Logs auto-expire after ${env.LOG_RETENTION_DAYS} days`,
	});
}

export async function handleClearLogs(env: Env, searchParams: URLSearchParams) {
	const olderThanDays = Math.max(1, parseInt(searchParams.get('olderThanDays') || '30', 10));

	const deletedCount = await clearOldLogs(env, olderThanDays);

	return json({
		success: true,
		deleted_count: deletedCount,
		message: `Cleared ${deletedCount} logs older than ${olderThanDays} days`,
		note: `Logs are also auto-cleared after ${env.LOG_RETENTION_DAYS} days via TTL`,
	});
}