# PlotBurn Cron Job Implementation

## Overview
Successfully implemented a scheduled cron job system that runs daily at 10 PM IST to automatically fetch now-playing movies and generate roasts for each one.

## Implementation Summary

### Files Created
- **[src/handlers/cron.ts](src/handlers/cron.ts)** - Complete cron handler with three main functions:
  - `runDailyRoastGeneration()` - Core cron logic
  - `handleCronTrigger()` - Manual trigger endpoint
  - `handleCronStatus()` - Status monitoring endpoint

### Files Modified
- **[src/types.ts](src/types.ts)** - Added `CronResult` and `CronHistory` interfaces
- **[src/constants.ts](src/constants.ts)** - Added cron constants and key helpers
- **[src/index.ts](src/index.ts)** - Added cron routes and scheduled handler
- **[wrangler.jsonc](wrangler.jsonc)** - Added cron trigger configuration

## Key Features

✅ **Scheduled Execution**: Runs automatically every day at 10 PM IST (4:30 PM UTC)
✅ **Manual Trigger**: POST `/cron/trigger` to run on-demand
✅ **Status Monitoring**: GET `/cron/status` to view execution history
✅ **Cost Optimized**: Sequential processing with 500ms delays between movies
✅ **Smart Caching**: Leverages existing 3-layer cache (NOW_PLAYING, TRUTH, ROAST KVs)
✅ **Error Resilient**: Continues processing even if individual movies fail
✅ **History Tracking**: Stores last 10 cron runs in KV storage
✅ **Full Observability**: Integrates with existing Logger class

## API Endpoints

### 1. Manual Trigger
```bash
POST /cron/trigger
```

**Important:** This endpoint starts the cron job in the **background** and returns immediately (202 Accepted). This prevents timeout issues since processing 15+ movies can take several minutes.

**Immediate Response (202 Accepted):**
```json
{
  "message": "Cron job started in background",
  "correlation_id": "manual-trigger-1737133800000",
  "status": "started",
  "check_status_at": "/cron/status"
}
```

**Why Background Processing?**
- Cloudflare Workers have a **30-second timeout** for HTTP requests
- Processing all movies can take **2-5 minutes** (15 movies × 500ms delay + API calls)
- Background execution uses `ctx.waitUntil()` which allows up to **15 minutes** (same as scheduled crons)

**To check results**, use the status endpoint with the returned `correlation_id`.

**Response (while job is running):**
```json
{
  "last_run": {
    "timestamp": "2026-01-17T16:30:00.000Z",
    "trigger": "manual",
    "correlation_id": "manual-trigger-1737133800000",
    "status": "in_progress"
  },
  "history": [],
  "total_runs": 0
}
```

The status field can be:
- `in_progress` - Job is currently running
- `success` - All movies processed successfully
- `partial` - Some movies failed but some succeeded
- `failed` - All movies failed or job crashed

### 2. Status Check
```bash
GET /cron/status
```

**Response (when job is complete):**
```json
{
  "last_run": {
    "timestamp": "2026-01-17T16:30:00.000Z",
    "trigger": "scheduled",
    "correlation_id": "cron-1737133800000",
    "movies_fetched": 15,
    "roasts_processed": 15,
    "roasts_cached": 13,
    "roasts_generated": 2,
    "roasts_failed": 0,
    "failed_movie_ids": [],
    "duration_ms": 8500,
    "status": "success"
  },
  "history": [
    { /* last run */ },
    { /* previous runs */ }
  ],
  "total_runs": 10
}
```

## Configuration

### Cron Schedule
- **Expression**: `30 16 * * *`
- **Time**: 10:00 PM IST (4:30 PM UTC)
- **Frequency**: Once daily
- **Location**: [wrangler.jsonc:40](wrangler.jsonc#L40)

### Rate Limiting
- **Delay**: 500ms between movies
- **Strategy**: Sequential processing (one movie at a time)
- **Configurable**: Update `CRON_DELAY_MS` in [src/constants.ts:23](src/constants.ts#L23)

### History Retention
- **Limit**: Last 10 runs
- **Storage**: ROAST_KV namespace
- **Configurable**: Update `CRON_HISTORY_LIMIT` in [src/constants.ts:22](src/constants.ts#L22)

## Cost Optimization

### Multi-Layer Caching Strategy

1. **NOW_PLAYING_KV** (23-hour TTL)
   - Caches movie list
   - Prevents refetching TMDB multiple times per day

2. **TRUTH_KV** (Permanent)
   - Stores movie research from Perplexity
   - Research done once per movie, reused forever

3. **ROAST_KV** (30-day TTL)
   - Stores generated roasts
   - Regenerates monthly but reuses truth research

### Expected API Costs

| Day | Movies Processed | API Calls | Cost Reduction |
|-----|-----------------|-----------|----------------|
| Day 1 | 15 (all new) | ~45 (15 × 3 APIs) | Baseline |
| Day 2 | 1-3 (new releases) | ~3-9 | ~90% reduction |
| Day 3-30 | 1-3 per day | ~3-9 per day | ~90% reduction |
| After 30 days | 15 (roasts expired) | ~15 (Grok only) | ~67% reduction |

**Key Insight**: After the first day, API costs drop by ~90% due to caching!

## Testing

### Local Development

1. **Start the server:**
```bash
npm run dev
```

2. **Check initial status:**
```bash
curl http://localhost:8787/cron/status
```

3. **Trigger manually:**
```bash
curl -X POST http://localhost:8787/cron/trigger
```

4. **Verify roasts were generated:**
```bash
curl http://localhost:8787/now-playing
curl http://localhost:8787/movie/{movie_id}
```

### Production Deployment

1. **Deploy to Cloudflare:**
```bash
npm run deploy
```

2. **Verify cron trigger in dashboard:**
   - Go to: Workers & Pages → plotburn-movie-api → Triggers
   - Should see: `30 16 * * *` under Cron Triggers

3. **Test scheduled execution:**
   - Click "Run now" in Cloudflare Dashboard
   - Monitor execution in Logs tab

4. **Check production status:**
```bash
curl https://plotburn-movie-api.workers.dev/cron/status
```

## Monitoring

### Via Status Endpoint
```bash
curl /cron/status
```

Shows:
- Last execution timestamp
- Number of movies processed
- Cache hit rate (cached vs generated)
- Failed movies (if any)
- Execution duration
- History of last 10 runs

### Via Logs Endpoint
```bash
curl /logs?limit=50
```

Shows detailed request/response logs for all cron executions.

### Via Debug Endpoint
```bash
curl /debug?correlationId=cron-1737133800000
```

Shows full debug payload for a specific cron run.

## Error Handling

### Movie-Level Errors
- Each movie processed in try-catch block
- Failures logged but don't stop processing
- Failed movie IDs tracked in `failed_movie_ids` array
- Status set to "partial" if some movies succeed

### Cron-Level Errors
- Top-level try-catch in scheduled handler
- Errors logged to console and LOG_KV
- Failed result stored for monitoring
- Worker continues running (doesn't crash)

## Timeout Handling

### Cloudflare Worker Limits

| Trigger Type | Time Limit | Use Case |
|--------------|-----------|----------|
| HTTP Request | 30 seconds | Manual trigger via API |
| Scheduled Cron | 15 minutes (900s) | Automatic scheduled execution |
| Background (waitUntil) | 15 minutes (900s) | Manual trigger in background |

### How Manual Trigger Works

1. **User calls** `POST /cron/trigger`
2. **Endpoint returns immediately** (202 Accepted) with correlation ID
3. **Job runs in background** using `ctx.waitUntil()` - up to 15 minutes allowed
4. **User polls** `GET /cron/status` to check progress
5. **Status shows** `in_progress` → `success`/`partial`/`failed`

### Expected Processing Times

- **First run**: 2-5 minutes (all 15 movies need processing)
- **Subsequent runs**: 30-60 seconds (most movies cached)
- **With 15 movies**: 15 × (API time + 500ms delay) = ~2-3 minutes
- **With 3 new movies**: 3 × (API time + 500ms delay) = ~30-45 seconds

### Polling Example

```bash
# Trigger the cron
curl -X POST https://your-worker.workers.dev/cron/trigger
# Response: { "correlation_id": "manual-trigger-123", "status": "started" }

# Poll status every 10 seconds
while true; do
  curl https://your-worker.workers.dev/cron/status | jq '.last_run.status'
  sleep 10
done
```

## Troubleshooting

### Rate Limiting Issues
**Symptom**: HTTP 429 errors from external APIs
**Solution**: Increase delay in [src/constants.ts:23](src/constants.ts#L23)
```typescript
export const CRON_DELAY_MS = 1000; // Increase to 1 second
```

### Timeout Issues
**Symptom**: Some movies fail to process
**Solution**: Check failed movie IDs and retry manually
```bash
curl http://localhost:8787/movie/{failed_movie_id}
```

### Wrong Timezone
**Symptom**: Cron runs at unexpected time
**Solution**: Update cron expression in [wrangler.jsonc:40](wrangler.jsonc#L40)
- Use [crontab.guru](https://crontab.guru/) to validate
- Remember: IST = UTC + 5:30

### Cache Busting
**Symptom**: Need to force regeneration of all roasts
**Solution**: Clear caches
```bash
curl -X DELETE /cache/clear/roast
curl -X DELETE /cache/clear/now-playing
```

## Architecture Details

### Execution Flow

1. **Trigger** (scheduled or manual)
2. **Fetch now-playing movies** → Uses `handleNowPlaying()`
   - Checks NOW_PLAYING_KV cache (23h TTL)
   - Fetches from TMDB if cache miss
3. **For each movie**:
   - Call `handleMovieRoast(movieId, env, correlationId)`
   - Check ROAST_KV cache (30d TTL)
   - If miss:
     - Check TRUTH_KV cache (permanent)
     - If miss: Call Perplexity to research movie
     - Call Grok to generate roast
     - Store in ROAST_KV
   - Add 500ms delay before next movie
4. **Store results**:
   - Save execution summary to CRON_KV
   - Update history (keep last 10 runs) in CRON_KV
   - Log to LOG_KV

### Data Storage

| Key | Storage | TTL | Purpose |
|-----|---------|-----|---------|
| `cron:last-run:v1` | CRON_KV | None | Latest execution result |
| `cron:history:v1` | CRON_KV | None | Last 10 execution results |
| `now-playing:v1` | NOW_PLAYING_KV | 23h | Cached movie list |
| `roast:v1:movie:{id}` | ROAST_KV | 30d | Generated roasts |
| `truth:v1:movie:{id}` | TRUTH_KV | None | Movie research |
| `log:v1:{correlationId}` | LOG_KV | 7d | Execution logs |

## Next Steps

1. **Deploy to production**:
   ```bash
   npm run deploy
   ```

2. **Monitor first execution**:
   - Check Cloudflare Dashboard logs
   - Verify all movies processed successfully
   - Confirm API costs match expectations

3. **Verify caching over time**:
   - Day 1: Note `roasts_generated` count
   - Day 2: Check that `roasts_cached` is high
   - Day 3+: Verify only new movies processed

4. **Set up alerts** (optional):
   - Configure Cloudflare alerts for errors
   - Monitor worker execution time
   - Track KV read/write operations

## Configuration Reference

### Environment Variables
- `KV_VERSION`: "v1" - Version for cache invalidation
- `LOG_RETENTION_DAYS`: 7 - Days to keep logs

### Constants
- `CRON_DELAY_MS`: 500ms - Delay between movie processing
- `CRON_HISTORY_LIMIT`: 10 - Number of historical runs to keep
- `NOW_PLAYING_TTL`: 23 hours - Cache duration for movie list
- `ROAST_TTL`: 30 days - Cache duration for roasts

### Cron Expression
- `30 16 * * *` - Every day at 4:30 PM UTC (10:00 PM IST)

---

**Implementation Complete!** 🎉

The cron job is now ready to run automatically every night at 10 PM IST, efficiently generating roasts for new movies while minimizing API costs through intelligent caching.
