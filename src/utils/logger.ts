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

export interface RequestLog {
	correlationId: string;
	startTime: string;
	endTime?: string;
	totalDuration?: number;
	endpoint: string;
	method: string;
	finalStatus?: number;
	entries: LogEntry[];
}

// Global buffer to store logs by correlationId
// This allows multiple Logger instances with the same correlationId to share the same buffer
const logBuffers = new Map<string, LogEntry[]>();

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

		// Initialize buffer for this correlationId if it doesn't exist
		if (!logBuffers.has(this.correlationId)) {
			logBuffers.set(this.correlationId, []);
		}
	}

	/**
	 * Add entry to buffer and console log immediately
	 * Console logs happen in real-time for Cloudflare dashboard visibility
	 * R2 storage happens on flush() for efficiency and atomicity
	 */
	private addEntry(entry: LogEntry) {
		// 1. Console log immediately for real-time visibility in Cloudflare dashboard
		const durationStr = entry.duration !== undefined ? `${entry.duration}ms` : '-';
		const movieInfo = entry.movieId ? `[Movie: ${entry.movieId}${entry.movieTitle ? ` - ${entry.movieTitle}` : ''}]` : '';
		const logMessage = `[${entry.level}] [${entry.correlationId}] ${entry.method} ${entry.endpoint} ${movieInfo} - ${entry.responseStatus || 'N/A'} - ${durationStr}`;

		if (entry.level === 'ERROR') {
			console.error(logMessage, entry.error || '', entry.metadata ? JSON.stringify(entry.metadata) : '');
		} else if (entry.level === 'WARN') {
			console.warn(logMessage, entry.metadata ? JSON.stringify(entry.metadata) : '');
		} else {
			console.log(logMessage);
		}

		// 2. Add to buffer for later R2 storage
		const buffer = logBuffers.get(this.correlationId);
		if (buffer) {
			buffer.push(entry);
		}
	}

	/**
	 * Flush all buffered logs to R2 as a single file
	 * Call this at the end of the request (in finally block) to ensure all logs are persisted
	 * Even if an error occurs mid-request, calling flush() in finally will save all accumulated logs
	 */
	async flush(finalStatus?: number): Promise<void> {
		const buffer = logBuffers.get(this.correlationId);
		if (!buffer || buffer.length === 0) {
			logBuffers.delete(this.correlationId);
			return;
		}

		if (!this.env.R2) {
			logBuffers.delete(this.correlationId);
			return;
		}

		try {
			const endTime = new Date().toISOString();
			const totalDuration = Date.now() - this.startTime;

			// Build the complete request log with all entries
			const requestLog: RequestLog = {
				correlationId: this.correlationId,
				startTime: new Date(this.startTime).toISOString(),
				endTime,
				totalDuration,
				endpoint: this.endpoint,
				method: this.method,
				finalStatus,
				entries: buffer,
			};

			// Store as a single file in R2
			const date = new Date().toISOString().split('T')[0];
			const logKey = `logs/${date}/${this.correlationId}.json`;

			await this.env.R2.put(logKey, JSON.stringify(requestLog, null, 2), {
				customMetadata: {
					correlationId: this.correlationId,
					endpoint: this.endpoint,
					method: this.method,
					status: finalStatus?.toString() || 'unknown',
					entryCount: buffer.length.toString(),
				},
			});

			console.log(`[LOGGER] Flushed ${buffer.length} entries to R2: ${logKey}`);
		} catch (err) {
			console.error('[LOGGER] Failed to flush logs to R2:', err);
		} finally {
			// Always clean up the buffer to prevent memory leaks
			logBuffers.delete(this.correlationId);
		}
	}

	/**
	 * Get current buffer size (useful for debugging)
	 */
	getBufferSize(): number {
		return logBuffers.get(this.correlationId)?.length || 0;
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

		this.addEntry(entry);
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
			metadata: redactSensitiveData(metadata),
		};

		this.addEntry(entry);
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
			metadata: redactSensitiveData(metadata),
		};

		this.addEntry(entry);
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

		this.addEntry(entry);
	}

	/**
	 * Log a debug message
	 */
	async logDebug(message: string, metadata?: Record<string, any>) {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level: 'DEBUG',
			correlationId: this.correlationId,
			endpoint: this.endpoint,
			method: this.method,
			metadata: {
				message,
				...redactSensitiveData(metadata),
			},
		};

		this.addEntry(entry);
	}

	/**
	 * Log a warning message
	 */
	async logWarn(message: string, metadata?: Record<string, any>) {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level: 'WARN',
			correlationId: this.correlationId,
			endpoint: this.endpoint,
			method: this.method,
			metadata: {
				message,
				...redactSensitiveData(metadata),
			},
		};

		this.addEntry(entry);
	}
}
