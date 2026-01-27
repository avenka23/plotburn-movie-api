import type { Env } from '../types';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface TraceEvent {
	timestamp: string;
	type: 'REQUEST' | 'RESPONSE' | 'ERROR' | 'EXTERNAL_API';
	data: Record<string, any>;
	duration?: number;
}

function redact(obj: any): any {
	if (!obj || typeof obj !== 'object') return obj;
	const clone = Array.isArray(obj) ? [...obj] : { ...obj };
	const sensitive = ['authorization', 'api_key', 'apikey', 'token', 'password', 'secret'];

	for (const k in clone) {
		if (sensitive.some((s) => k.toLowerCase().includes(s))) {
			clone[k] = '[REDACTED]';
		} else if (typeof clone[k] === 'object') {
			clone[k] = redact(clone[k]);
		}
	}
	return clone;
}

function generateCorrelationId(): string {
	return `${Date.now()}-${crypto.randomUUID()}`;
}

export class TraceLogger {
	private env: Env;
	private startTime = Date.now();
	private events: TraceEvent[] = [];
	public readonly correlationId: string;
	private endpoint: string;
	private method: string;

	constructor(env: Env, endpoint: string, method: string, correlationId?: string) {
		this.env = env;
		this.endpoint = endpoint;
		this.method = method;
		this.correlationId = correlationId || generateCorrelationId();
	}

	logRequest(metadata?: Record<string, any>) {
		this.events.push({
			timestamp: new Date().toISOString(),
			type: 'REQUEST',
			data: redact(metadata || {}),
		});
	}

	logExternal(api: string, request: any, response?: any, error?: string, duration?: number) {
		this.events.push({
			timestamp: new Date().toISOString(),
			type: 'EXTERNAL_API',
			duration,
			data: {
				api,
				request: redact(request),
				response: response ? redact(response) : undefined,
				error,
			},
		});
	}

	logResponse(status: number, metadata?: any) {
		this.events.push({
			timestamp: new Date().toISOString(),
			type: 'RESPONSE',
			duration: Date.now() - this.startTime,
			data: {
				status,
				metadata: redact(metadata),
			},
		});
	}

	logError(err: Error | string, metadata?: any) {
		this.events.push({
			timestamp: new Date().toISOString(),
			type: 'ERROR',
			duration: Date.now() - this.startTime,
			data: {
				message: typeof err === 'string' ? err : err.message,
				metadata: redact(metadata),
			},
		});
	}

	async flush() {
		const trace = {
			correlationId: this.correlationId,
			endpoint: this.endpoint,
			method: this.method,
			startedAt: new Date(this.startTime).toISOString(),
			totalDurationMs: Date.now() - this.startTime,
			events: this.events,
		};

		const date = new Date().toISOString().split('T')[0];
		const key = `logs/${date}/${this.correlationId}.json`;

		// Console (for CF dashboard)
		console.log(`[TRACE] ${this.method} ${this.endpoint} ${trace.totalDurationMs}ms`, trace);

		// R2 (single write)
		if (this.env.R2) {
			try {
				await this.env.R2.put(key, JSON.stringify(trace), {
					customMetadata: {
						endpoint: this.endpoint,
						method: this.method,
					},
				});
			} catch (err) {
				console.error('Failed to write trace to R2:', err);
			}
		}
	}
}
