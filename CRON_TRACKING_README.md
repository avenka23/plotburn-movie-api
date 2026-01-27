# Cron Tracking Implementation

We have replaced the KV-based state tracking with a robust D1 database table approach.

## 1. Database Migration

You need to apply the new schema to your D1 database. A migration file has been created at `migration_cron_tracking.sql`.

**To apply locally:**
```bash
npx wrangler d1 execute plotburn-movie-db --local --file=migration_cron_tracking.sql
```

**To apply to production:**
```bash
npx wrangler d1 execute plotburn-movie-db --remote --file=migration_cron_tracking.sql
```

*(Note: Replace `plotburn-movie-db` with your actual database name if different)*

## 2. Changes Made

### Schema
- Added `cron_runs` table: Tracks history, status, and holds the "lock" (via `status='running'`).
- Added index `idx_cron_runs_active`: For efficient lock checking.

### Code
- **`src/services/cron.ts`**: New `CronTracker` class that handles locking, progress updates, and history fetching.
- **`src/handlers/cron.ts`**: Updated to use `CronTracker`.
    - **Concurrency**: Now checks for existing running jobs and aborts if found.
    - **Progress**: Updates the database with processed movie titles in real-time.
    - **History**: `/cron/status` now returns actual run history from D1.
- **`src/types.ts`**: Added `CronHistoryEntry` and updated `CronResult`.

## 3. Verifying

1. **Trigger a Run**:
   ```bash
   curl -X POST https://your-worker.workers.dev/cron/trigger
   ```

2. **Check Status**:
   ```bash
   curl https://your-worker.workers.dev/cron/status
   ```
   You should see a JSON response with a unique `run_id` and status.

3. **Concurrency Test**:
   Trigger the cron job twice in rapid succession. The second request should log "Cron execution skipped: Job already running".
