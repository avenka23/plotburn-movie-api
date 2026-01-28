# Cloudflare Queue Implementation - Deployment Guide

## Overview

This project now uses **Cloudflare Queues** to process movies asynchronously, avoiding Worker subrequest limits during cron jobs.

### Architecture

```
Cron Job (Daily)
   ↓
Fetch ~50 movies from TMDB
   ↓
Send 50 individual queue messages
   ↓
Queue Consumers (max 2 parallel) ← Limited by Claude API rate limits
   ↓
Each consumer:
  1. Check roasts table if already exists
  2. Process movie roast (Brave Search + Claude)
  3. Store roast in roasts table
  4. Acknowledge or retry message
```

### Key Features

- ✅ **No Subrequest Limits**: Each queue consumer gets fresh subrequest budget
- ✅ **Automatic Retries**: Failed movies retry up to 3 times
- ✅ **Deduplication**: Uses existing roasts table (single source of truth)
- ✅ **Rate Limit Compliance**: max_concurrency=2 respects Claude API limits
- ✅ **Cost Optimized**: 1-hour cache TTL reduces Claude API costs

---

## Prerequisites

Before deploying, ensure you have:

1. **Wrangler CLI** installed and authenticated:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **D1 Database** already created (plotburn-db exists)

3. **All secrets** configured:
   ```bash
   wrangler secret put TMDB_API_KEY
   wrangler secret put XAI_API_KEY
   wrangler secret put BRAVE_API_KEY
   wrangler secret put CLAUDE_API_KEY
   wrangler secret put API_SECRET_KEY
   ```

---

## Deployment Steps

### 1. Verify D1 Schema

No migration needed! The queue system uses the existing `roasts` table for deduplication.

**Optionally verify schema**:
```bash
wrangler d1 execute plotburn-db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

You should see the `roasts` table already exists.

---

### 2. Create Cloudflare Queues

The queues are defined in `wrangler.toml` but need to be created:

```bash
# Create main processing queue
wrangler queues create movie-processing-queue

# Create dead letter queue for permanently failed messages
wrangler queues create movie-processing-dlq
```

**Verify queues**:
```bash
wrangler queues list
```

You should see both `movie-processing-queue` and `movie-processing-dlq`.

---

### 3. Deploy the Worker

Remove the old `wrangler.jsonc` and deploy:

```bash
# Remove old config
rm wrangler.jsonc

# Deploy with new wrangler.toml
wrangler deploy
```

**Expected output**:
```
✨ Compiled Worker successfully
✨ Uploaded worker 'plotburn-movie-api'
✨ Deployed plotburn-movie-api
   https://plotburn-movie-api.<your-subdomain>.workers.dev
```

---

### 4. Test the Queue System

#### Test Manual Trigger

```bash
curl -X POST https://plotburn-movie-api.<your-subdomain>.workers.dev/cron/trigger \
  -H "x-api-key: YOUR_API_SECRET_KEY"
```

**Expected response**:
```json
{
  "message": "Cron job started in background",
  "correlation_id": "manual-trigger-1706...",
  "status": "started",
  "check_status_at": "/cron/status"
}
```

#### Monitor Queue Processing

Use Cloudflare Dashboard:

1. Go to **Workers & Pages** → **Queues**
2. Click on `movie-processing-queue`
3. View metrics:
   - Messages sent
   - Messages delivered
   - Messages retried
   - Consumers active

#### Check Roasts Created

```bash
wrangler d1 execute plotburn-db --remote --command="
  SELECT 
    movie_id, 
    created_at,
    is_active
  FROM roasts 
  ORDER BY created_at DESC 
  LIMIT 10;
"
```

#### Check Cron Status

```bash
curl https://plotburn-movie-api.<your-subdomain>.workers.dev/cron/status \
  -H "x-api-key: YOUR_API_SECRET_KEY"
```

---

## Monitoring & Debugging

### View Live Logs

```bash
wrangler tail
```

Look for:
- `[Queue][correlation-id] Processing <movie>...` - Queue consuming
- `[Queue][correlation-id] ✓ <movie> (Xms)` - Success
- `[Queue][correlation-id] ✗ <movie>: error` - Failures

### Check Dead Letter Queue

If messages are failing repeatedly:

```bash
wrangler queues consumer <consumer-name> --queue-name movie-processing-dlq
```

---

## Configuration Options

### Increase Concurrency

If using Claude prompt caching effectively, you can increase parallelism:

**In wrangler.toml**:
```toml
[[queues.consumers]]
queue = "movie-processing-queue"
max_batch_size = 1
max_concurrency = 4  # Increase from 2 to 4
max_retries = 3
dead_letter_queue = "movie-processing-dlq"
```

Then redeploy:
```bash
wrangler deploy
```

### Adjust Retry Strategy

Modify `max_retries` in `wrangler.toml`:
- Higher = More resilient to transient errors
- Lower = Faster to dead letter queue

---

## Rollback Plan

If issues occur, you can temporarily disable queue processing:

1. **Remove queue consumer** from `wrangler.toml`:
   ```toml
   # Comment out the consumer section
   # [[queues.consumers]]
   # queue = "movie-processing-queue"
   # ...
   ```

2. **Redeploy**:
   ```bash
   wrangler deploy
   ```

This stops queue processing but keeps the cron job queuing movies. Fix issues, then re-enable the consumer.

---

## Troubleshooting

### Queue Messages Not Processing

**Symptom**: Movies queued but not processed

**Debug**:
```bash
# Check queue metrics
wrangler queues consumer <name> --queue-name movie-processing-queue

# Check worker logs
wrangler tail
```

**Solutions**:
- Verify consumer is deployed: `wrangler deployments list`
- Check for errors in logs
- Verify max_concurrency isn't 0

### High Failure Rate

**Symptom**: Many messages in dead letter queue

**Check dead letter queue**:
```bash
wrangler queues consumer <consumer-name> --queue-name movie-processing-dlq
```

**Common causes**:
- API rate limits (increase delay or reduce concurrency)
- Invalid API keys
- TMDB movie not found

### Cost Concerns

**Monitor**:
- Cloudflare Dashboard → Workers → Usage
- Queue operations count
- D1 reads/writes

**Queues Free Tier**: 1M operations/month should be sufficient.

---

## Next Steps

- [ ] Monitor first cron run (daily at 16:30 UTC)
- [ ] Verify all movies processed successfully
- [ ] Check Claude API costs with 1-hour caching
- [ ] Optimize max_concurrency if needed
- [ ] Set up alerts for dead letter queue messages
