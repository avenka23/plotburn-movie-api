# PlotBurn Logging System

## Overview

Comprehensive logging system for the PlotBurn Movie API that tracks all requests, responses, and external API calls with automatic cleanup.

## Features

- ✅ **Request/Response Logging**: Every API endpoint logs full request and response details
- ✅ **External API Logging**: All calls to TMDB, Perplexity, and Grok are logged with timing and costs
- ✅ **Sensitive Data Redaction**: Automatically redacts API keys, tokens, and authorization headers
- ✅ **Auto-Cleanup**: Logs expire automatically after 7 days (configurable)
- ✅ **Multiple Storage**: Logs to both Cloudflare KV (persistent) and console (dashboard)
- ✅ **Queryable**: Retrieve logs via API with filtering options

## Configuration

### Environment Variables (wrangler.jsonc)

```json
{
  "vars": {
    "KV_VERSION": "v1",
    "LOG_RETENTION_DAYS": 7  // Auto-delete logs after 7 days
  }
}
```

### KV Namespace

```json
{
  "binding": "LOG_KV",
  "id": "f0970fbdb76845748d946f51c52874ac"
}
```

## API Endpoints

### Get Logs

```
GET /logs?limit=100&level=ERROR
```

**Query Parameters:**
- `limit` (optional): Number of logs to retrieve (1-1000, default: 100)
- `level` (optional): Filter by log level (INFO, WARN, ERROR, DEBUG)

**Response:**
```json
{
  "total": 50,
  "logs": [
    {
      "timestamp": "2026-01-16T14:30:00.000Z",
      "level": "INFO",
      "endpoint": "/movie/123",
      "method": "GET",
      "responseStatus": 200,
      "duration": 1234,
      "metadata": { ... }
    }
  ],
  "note": "Logs auto-expire after 7 days"
}
```

### Clear Old Logs

```
DELETE /logs?olderThanDays=30
```

**Query Parameters:**
- `olderThanDays` (optional): Delete logs older than this many days (default: 30)

**Response:**
```json
{
  "success": true,
  "deleted_count": 150,
  "message": "Cleared 150 logs older than 30 days",
  "note": "Logs are also auto-cleared after 7 days via TTL"
}
```

## Log Structure

### API Request/Response Log

```typescript
{
  timestamp: "2026-01-16T14:30:00.000Z",
  level: "INFO",           // INFO, WARN, ERROR, DEBUG
  endpoint: "/movie/123",
  method: "GET",
  requestBody: {...},      // Sensitive data redacted
  responseStatus: 200,
  responseBody: "...",     // Limited to 1000 chars
  duration: 1234,          // milliseconds
  metadata: {
    queryParams: {...},
    headers: {...}         // Authorization redacted
  }
}
```

### External API Call Log

```typescript
{
  timestamp: "2026-01-16T14:30:00.000Z",
  level: "DEBUG",
  endpoint: "/api/perplexity",
  method: "EXTERNAL_API",
  requestBody: {
    movie: "Inception",
    model: "sonar"
  },
  responseBody: {
    tokens: 2500,
    cost_usd: 0.05,
    cost_inr: 4.25,
    citations_count: 8
  },
  duration: 2340,
  metadata: {
    apiName: "Perplexity Sonar"
  }
}
```

## Logged Information

### 1. All API Endpoints
- Request method and endpoint
- Query parameters
- Request headers (sensitive data redacted)
- Response status code
- Response body (truncated to 1000 chars)
- Request duration in milliseconds

### 2. External API Calls

#### TMDB API
- Movie ID being fetched
- Request type (now_playing, movie details)
- Response duration
- Success/failure status

#### Perplexity Sonar API
- Movie title and year
- Model used (sonar)
- Token usage
- Cost in USD and INR
- Number of citations
- Request duration
- Error details (if failed)

#### Grok/xAI API
- Movie title and year
- Model used (grok-4-1-fast-reasoning)
- Request parameters (temperature, max_tokens, etc.)
- Response structure
- Request duration
- Error details (if failed)

## Security Features

### Sensitive Data Redaction

The following data is automatically redacted from logs:
- Authorization headers
- API keys (any field containing "api_key", "apikey", "token")
- Passwords
- Secrets

**Example:**
```json
// Before redaction
{
  "headers": {
    "Authorization": "Bearer sk-abc123..."
  }
}

// After redaction
{
  "headers": {
    "Authorization": "[REDACTED]"
  }
}
```

## Viewing Logs

### 1. Via API

```bash
# Get last 100 logs
curl https://your-worker.workers.dev/logs

# Get only ERROR logs
curl https://your-worker.workers.dev/logs?level=ERROR&limit=50

# Get specific number of logs
curl https://your-worker.workers.dev/logs?limit=200
```

### 2. Via Cloudflare Dashboard

1. Go to Workers & Pages
2. Select your worker (plotburn-movie-api)
3. Click on "Logs" tab
4. View real-time console logs

### 3. Via Wrangler CLI

```bash
# Tail logs in real-time
npx wrangler tail

# Tail logs with filtering
npx wrangler tail --status error
```

## Log Retention & Cleanup

### Automatic Cleanup (TTL)
- Logs automatically expire after `LOG_RETENTION_DAYS` (default: 7 days)
- Uses Cloudflare KV's built-in TTL feature
- No manual intervention required
- Zero storage cost after expiration

### Manual Cleanup
```bash
# Delete logs older than 30 days
curl -X DELETE https://your-worker.workers.dev/logs?olderThanDays=30
```

## Implementation Details

### Logger Class

```typescript
import { Logger } from './utils/logger';

// In your handler
const logger = new Logger(env, '/movie/123', 'GET');

// Log request
await logger.logRequest({ queryParams: {...} });

// Log response
await logger.logResponse(200, responseBody);

// Log external API call
await logger.logExternalAPICall(
  'Perplexity Sonar',
  { movie: 'Inception' },
  { tokens: 2500, cost_usd: 0.05 },
  undefined,  // error (if any)
  1234        // duration in ms
);

// Log errors
await logger.logError(error);
```

### Integration Points

1. **Main Router** ([src/index.ts](src/index.ts:17)): Logs all incoming requests and outgoing responses
2. **Perplexity Service** ([src/services/perplexity.ts](src/services/perplexity.ts:7)): Logs API calls with costs
3. **Grok Service** (needs integration): Log roast generation calls
4. **TMDB Service** (needs integration): Log movie data fetches

## Cost Considerations

### Storage Costs
- Cloudflare KV: Free up to 1GB
- Each log entry: ~1-3 KB
- At 7 days retention: ~5,000-10,000 requests = ~10-30 MB
- Well within free tier for most applications

### Read/Write Costs
- KV writes: First 1,000/day free, then $0.50 per million
- KV reads: First 100,000/day free, then $0.50 per million
- Logging adds 2 writes per request (request + response)

## Troubleshooting

### Logs not appearing in KV?
- Check that `LOG_KV` namespace is properly bound in wrangler.jsonc
- Verify `LOG_RETENTION_DAYS` is set in environment variables
- Check Cloudflare dashboard for any KV write errors

### Logs disappearing?
- Logs expire after `LOG_RETENTION_DAYS` (default: 7 days)
- This is intentional to manage storage costs
- Increase retention period if needed

### Sensitive data in logs?
- Logger automatically redacts: authorization, api_key, token, password, secret
- Add more sensitive keywords in `redactSensitiveData` function if needed

## Next Steps

To complete the logging implementation:

1. ✅ Logger utility created with redaction
2. ✅ LOG_KV namespace created
3. ✅ Main router integrated
4. ✅ Perplexity service integrated
5. ⏳ TODO: Add logging to Grok service
6. ⏳ TODO: Add logging to TMDB service
7. ⏳ TODO: Test full logging pipeline

## Example Log Output

```json
[
  {
    "timestamp": "2026-01-16T14:30:15.234Z",
    "level": "INFO",
    "endpoint": "/movie/123",
    "method": "GET",
    "responseStatus": 200,
    "duration": 1234,
    "metadata": {
      "queryParams": {},
      "headers": {
        "user-agent": "Mozilla/5.0...",
        "authorization": "[REDACTED]"
      }
    }
  },
  {
    "timestamp": "2026-01-16T14:30:16.123Z",
    "level": "DEBUG",
    "endpoint": "/api/perplexity",
    "method": "EXTERNAL_API",
    "requestBody": {
      "movie": "Inception (2010)",
      "model": "sonar"
    },
    "responseBody": {
      "tokens": 2500,
      "cost_usd": 0.05,
      "cost_inr": 4.25,
      "citations_count": 8
    },
    "duration": 2340,
    "metadata": {
      "apiName": "Perplexity Sonar"
    }
  }
]
```
