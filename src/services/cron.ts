import type { Env } from '../types';

export class CronTracker {
	private env: Env;
	private jobName: string;

	constructor(env: Env, jobName: string) {
		this.env = env;
		this.jobName = jobName;
	}

	/**
	 * Attempt to acquire a lock for this job.
	 * Returns the runId if successful, or throws an error if the job is already running.
	 */
	async startRun(): Promise<number> {
		const now = Date.now();
		
		try {
			// 1. Check if job is already running
			const active = await this.env.plotburn_db.prepare(`
				SELECT id FROM cron_runs
				WHERE job_name = ? AND status = 'running'
				LIMIT 1
			`).bind(this.jobName).first();

			if (active) {
				throw new Error(`Job '${this.jobName}' is already running (run_id: ${active.id})`);
			}

			// 2. Insert new run - this will fail at DB level if unique constraint is violated
			const res = await this.env.plotburn_db.prepare(`
				INSERT INTO cron_runs (job_name, started_at, status)
				VALUES (?, ?, 'running')
			`).bind(this.jobName, now).run();

			return res.meta.last_row_id as number;
		} catch (e: any) {
			// Check if this is a unique constraint violation
			// SQLite error message contains "UNIQUE constraint failed"
			if (e.message && (e.message.includes('UNIQUE constraint') || e.message.includes('already running'))) {
				throw new Error(`Job '${this.jobName}' is already running`);
			}
			
			console.error(`[CronTracker] Failed to start run for ${this.jobName}:`, e);
			throw e;
		}
	}

	/**
	 * Update progress for the current run.
	 */
	async updateProgress(runId: number, titles: string[], count: number) {
		await this.env.plotburn_db.prepare(`
			UPDATE cron_runs
			SET movies_roasted_count = ?, movie_titles = ?
			WHERE id = ?
		`).bind(count, titles.join(", "), runId).run();
	}

	/**
	 * Mark the run as successful.
	 */
	async completeRun(runId: number, cursor: string | null = null) {
		// Get started_at to calculate duration
		const run = await this.env.plotburn_db.prepare(`
			SELECT started_at FROM cron_runs WHERE id = ?
		`).bind(runId).first<{ started_at: number }>();
		
		const now = Date.now();
		const duration = run ? now - run.started_at : null;
		
		await this.env.plotburn_db.prepare(`
			UPDATE cron_runs
			SET finished_at = ?, duration_ms = ?, status = 'success', cursor = ?
			WHERE id = ?
		`).bind(now, duration, cursor, runId).run();
	}

	/**
	 * Mark the run as failed.
	 */
	async failRun(runId: number, error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		
		// Get started_at to calculate duration
		const run = await this.env.plotburn_db.prepare(`
			SELECT started_at FROM cron_runs WHERE id = ?
		`).bind(runId).first<{ started_at: number }>();
		
		const now = Date.now();
		const duration = run ? now - run.started_at : null;
		
		await this.env.plotburn_db.prepare(`
			UPDATE cron_runs
			SET finished_at = ?, duration_ms = ?, status = 'failed', error = ?
			WHERE id = ?
		`).bind(now, duration, errorMessage, runId).run();
	}
	
	/**
	 * Get recent history for this job.
	 */
	async getHistory(limit: number = 20) {
		const result = await this.env.plotburn_db.prepare(`
			SELECT * FROM cron_runs
			WHERE job_name = ?
			ORDER BY started_at DESC
			LIMIT ?
		`).bind(this.jobName, limit).all();
		
		return result.results;
	}
}
