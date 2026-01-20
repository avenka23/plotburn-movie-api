import type { Env } from '../types';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	correlationId: string;
	endpoint: string;
	method: string;
	movieId?: string;
	movieTitle?: string;
	responseStatus?: number;
	duration?: number;
	error?: string;
	metadata?: Record<string, any>;
}

// Helper function to redact sensitive data
function redactSensitiveData(obj: any): any {
	if (!obj || typeof obj !== 'object') return obj;

	const redacted = Array.isArray(obj) ? [...obj] : { ...obj };
	const sensitiveKeys = ['authorization', 'api_key', 'apikey', 'token', 'password', 'secret'];

	for (const key in redacted) {
		const lowerKey = key.toLowerCase();
		if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
			redacted[key] = '[REDACTED]';
		} else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
			redacted[key] = redactSensitiveData(redacted[key]);
		}
	}

	return redacted;
}

// Generate a unique correlation ID
function generateCorrelationId(): string {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export class Logger {
	private env: Env;
	private startTime: number;
	private endpoint: string;
	private method: string;
	public correlationId: string;

	constructor(env: Env, endpoint: string, method: string, correlationId?: string) {
		this.env = env;
		this.startTime = Date.now();
		this.endpoint = endpoint;
		this.method = method;
		this.correlationId = correlationId || generateCorrelationId();
	}

	private async writeLog(entry: LogEntry) {
		// 1. Console log for Cloudflare dashboard
		const durationStr = entry.duration !== undefined ? `${entry.duration}ms` : '-';
		const movieInfo = entry.movieId ? `[Movie: ${entry.movieId}${entry.movieTitle ? ` - ${entry.movieTitle}` : ''}]` : '';
		const logMessage = `[${entry.level}] [${entry.correlationId}] ${entry.method} ${entry.endpoint} ${movieInfo} - ${entry.responseStatus || 'N/A'} - ${durationStr}`;

		if (entry.level === 'ERROR') {
			console.error(logMessage, entry);
		} else if (entry.level === 'WARN') {
			console.warn(logMessage, entry);
		} else {
			console.log(logMessage, entry);
		}

		// 2. Store in LOG_KV with auto-expiry
		if (this.env.LOG_KV) {
			try {
				const logKey = `log:${this.env.KV_VERSION}:${entry.correlationId}`;
				await this.env.LOG_KV.put(logKey, JSON.stringify(entry), {
					expirationTtl: this.env.LOG_RETENTION_DAYS ? this.env.LOG_RETENTION_DAYS * 24 * 60 * 60 : 7 * 24 * 60 * 60, // Default 7 days
				});
			} catch (err) {
				console.error('Failed to write log to KV:', err);
			}
		}
	}

	async logRequest(metadata?: Record<string, any>) {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level: 'INFO',
			correlationId: this.correlationId,
			endpoint: this.endpoint,
			method: this.method,
			movieId: metadata?.movieId,
			movieTitle: metadata?.movieTitle,
			metadata: redactSensitiveData(metadata),
		};

		await this.writeLog(entry);
	}

	async logResponse(status: number, metadata?: Record<string, any>) {
		const duration = Date.now() - this.startTime;
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level: status >= 400 ? 'ERROR' : 'INFO',
			correlationId: this.correlationId,
			endpoint: this.endpoint,
			method: this.method,
			movieId: metadata?.movieId,
			movieTitle: metadata?.movieTitle,
			responseStatus: status,
			duration,
			metadata,
		};

		await this.writeLog(entry);
	}

	async logError(error: Error | string, metadata?: Record<string, any>) {
		const duration = Date.now() - this.startTime;
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level: 'ERROR',
			correlationId: this.correlationId,
			endpoint: this.endpoint,
			method: this.method,
			movieId: metadata?.movieId,
			movieTitle: metadata?.movieTitle,
			error: typeof error === 'string' ? error : error.message,
			duration,
			metadata,
		};

		await this.writeLog(entry);
	}

	async logExternalAPICall(apiName: string, requestData: any, responseData?: any, error?: string, duration?: number) {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level: error ? 'ERROR' : 'DEBUG',
			correlationId: this.correlationId,
			endpoint: this.endpoint,
			method: 'EXTERNAL_API',
			movieId: requestData?.movieId,
			movieTitle: requestData?.movieTitle || requestData?.movie,
			duration,
			error,
			metadata: {
				apiName,
				...redactSensitiveData(requestData),
				...(responseData ? redactSensitiveData(responseData) : {}),
			},
		};

		await this.writeLog(entry);
	}
}

// Helper function to retrieve logs
export async function getLogs(
	env: Env,
	options: {
		limit?: number;
		level?: LogLevel;
		startDate?: string;
		endDate?: string;
	} = {}
): Promise<LogEntry[]> {
	const { limit = 100, level } = options;

	try {
		const listResult = await env.LOG_KV.list({
			prefix: `log:${env.KV_VERSION}:`,
			limit,
		});

		const logs: LogEntry[] = [];
		for (const key of listResult.keys) {
			const logData = await env.LOG_KV.get(key.name);
			if (logData) {
				const log = JSON.parse(logData) as LogEntry;
				if (!level || log.level === level) {
					logs.push(log);
				}
			}
		}

		// Sort by timestamp descending (newest first)
		logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

		return logs;
	} catch (err) {
		console.error('Failed to retrieve logs:', err);
		return [];
	}
}

// Helper function to clear old logs manually (though TTL handles this automatically)
export async function clearOldLogs(env: Env, olderThanDays: number): Promise<number> {
	try {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

		const listResult = await env.LOG_KV.list({
			prefix: `log:${env.KV_VERSION}:`,
		});

		let deletedCount = 0;
		for (const key of listResult.keys) {
			const logData = await env.LOG_KV.get(key.name);
			if (logData) {
				const log = JSON.parse(logData) as LogEntry;
				if (new Date(log.timestamp) < cutoffDate) {
					await env.LOG_KV.delete(key.name);
					deletedCount++;
				}
			}
		}

		return deletedCount;
	} catch (err) {
		console.error('Failed to clear old logs:', err);
		return 0;
	}
}