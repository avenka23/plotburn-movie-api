# PlotBurn Logging System

## Overview

Comprehensive logging system for the PlotBurn Movie API that tracks all requests, responses, and external API calls with automatic R2 storage.

## Features

- Request/Response Logging: Every API endpoint logs full request and response details
- External API Logging: All calls to TMDB, Brave Search, and Claude are logged with timing and costs
- Sensitive Data Redaction: Automatically redacts API keys, tokens, and authorization headers
- R2 Storage: Logs stored in Cloudflare R2 for persistence
- Console Output: Real-time logging via Cloudflare Dashboard

## Configuration

### Environment Variables (wrangler.jsonc)

```json
{
  "vars": {
    "KV_VERSION": "v1"
  }
}
```

### R2 Bucket

```json
{
  "binding": "R2",
  "bucket_name": "plotburn-r2"
}
```

## Log Structure

### API Request/Response Log

```typescript
{
  timestamp: "2026-01-27T14:30:00.000Z",
  level: "INFO",
  endpoint: "/movie/123",
  method: "GET",
  requestBody: {...},
  responseStatus: 200,
  responseBody: "...",
  duration: 1234,
  metadata: {
    queryParams: {...},
    headers: {...}  // Authorization redacted
  }
}
```

### External API Call Log

```typescript
{
  timestamp: "2026-01-27T14:30:00.000Z",
  level: "DEBUG",
  endpoint: "/api/brave",
  method: "EXTERNAL_API",
  requestBody: {
    movie: "Inception",
    query: "Inception 2010 movie reviews"
  },
  responseBody: {
    results_count: 10,
    cost_usd: 0.005
  },
  duration: 1200,
  metadata: {
    apiName: "Brave Search"
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
- Request type (now_playing, popular, movie details)
- Response duration
- Success/failure status

#### Brave Search API
- Movie title and year
- Search query
- Results count
- Cost estimates
- Request duration
- Error details (if failed)

#### Claude API
- Movie title
- Model used (claude-sonnet-4-20250514)
- Token usage (input/output/total)
- Cost in USD and INR
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

### 1. Via Cloudflare Dashboard

1. Go to Workers & Pages
2. Select your worker (plotburn-movie-api)
3. Click on "Logs" tab
4. View real-time console logs

### 2. Via Wrangler CLI

```bash
# Tail logs in real-time
npx wrangler tail

# Tail logs with filtering
npx wrangler tail --status error
```

### 3. Via R2 Bucket

Logs are stored in R2 with the path pattern:
```
logs/{YYYY-MM-DD}/{correlationId}.json
```

Access via Cloudflare Dashboard > R2 > plotburn-r2

## Implementation Details

### Logger Class

```typescript
import { Logger } from './utils/logger';

// In your handler
const logger = new Logger(env, '/movie/123', 'GET', correlationId);

// Log request
await logger.logRequest({ queryParams: {...} });

// Log response
await logger.logResponse(200, responseBody);

// Log external API call
await logger.logExternalAPICall(
  'Claude',
  { movie: 'Inception' },
  { tokens: 2500, cost_usd: 0.05 },
  undefined,  // error (if any)
  1234        // duration in ms
);

// Log errors
await logger.logError(error);

// Flush logs to R2 (call in finally block)
await logger.flush(responseStatus);
```

### Integration Points

1. **Main Router** (src/index.ts): Logs all incoming requests and outgoing responses
2. **Brave Service** (src/services/brave.ts): Logs search API calls with costs
3. **Claude Service** (src/services/claude.ts): Logs roast generation calls with token usage
4. **TMDB Service** (src/services/tmdb.ts): Logs movie data fetches

## Cost Considerations

### R2 Storage Costs
- Cloudflare R2: Free up to 10GB storage
- Each log entry: ~1-3 KB
- Class A operations (writes): First 1,000,000/month free
- Class B operations (reads): First 10,000,000/month free

## Troubleshooting

### Logs not appearing in R2?
- Check that `R2` bucket is properly bound in wrangler.jsonc
- Verify the bucket exists in your Cloudflare account
- Check Cloudflare dashboard for any R2 write errors

### Sensitive data in logs?
- Logger automatically redacts: authorization, api_key, token, password, secret
- Add more sensitive keywords in `redactSensitiveData` function if needed

## Example Log Output

```json
[
  {
    "timestamp": "2026-01-27T14:30:15.234Z",
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
    "timestamp": "2026-01-27T14:30:16.123Z",
    "level": "DEBUG",
    "endpoint": "/api/claude",
    "method": "EXTERNAL_API",
    "requestBody": {
      "movie": "Inception (2010)",
      "model": "claude-sonnet-4-20250514"
    },
    "responseBody": {
      "input_tokens": 1500,
      "output_tokens": 800,
      "total_tokens": 2300,
      "cost_usd": 0.012,
      "cost_inr": 1.02
    },
    "duration": 2340,
    "metadata": {
      "apiName": "Claude"
    }
  }
]
```
