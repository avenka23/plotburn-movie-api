# PlotBurn Movie API - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Base URL](#base-url)
4. [Common Headers](#common-headers)
5. [Endpoints](#endpoints)
   - [Movie Endpoints](#movie-endpoints)
   - [Now Playing & Feed](#now-playing--feed)
   - [Cache Management](#cache-management)
   - [Cron Job Management](#cron-job-management)
   - [Logging & Debug](#logging--debug)
6. [Response Formats](#response-formats)
7. [Error Handling](#error-handling)
8. [Rate Limiting](#rate-limiting)

---

## Overview

PlotBurn Movie API is a Cloudflare Workers-based API that generates satirical movie roasts using AI. It integrates with:
- **TMDB API** - Movie metadata
- **Perplexity API** - Fact-checking and truth gathering
- **Grok (xAI) API** - Satirical content generation

The API automatically caches results and provides a daily cron job to pre-generate roasts for now-playing movies.

---

## Authentication

All endpoints require API key authentication via the `x-api-key` header.

```bash
curl -H "x-api-key: your-secret-key" https://api.plotburn.com/now-playing
```

**Error Response (401 Unauthorized):**
```json
{
  "error": "Unauthorized",
  "message": "Missing x-api-key header"
}
```

---

## Base URL

```
https://your-worker.workers.dev
```

Replace with your actual Cloudflare Workers domain.

---

## Common Headers

| Header | Required | Description |
|--------|----------|-------------|
| `x-api-key` | Yes | API authentication key |
| `x-correlation-id` | No | Custom correlation ID for request tracking (auto-generated if not provided) |

---

## Endpoints

### Movie Endpoints

#### 1. Get Movie Roast

Generates or retrieves a cached satirical roast for a specific movie.

**Endpoint:** `GET /movie/{tmdbId}`

**Parameters:**
- `tmdbId` (path) - TMDB movie ID (e.g., 1439713)

**Example Request:**
```bash
curl -H "x-api-key: your-key" \
  https://api.plotburn.com/movie/1439713
```

**Response (200 OK):**
```json
{
  "cached": false,
  "movie": {
    "adult": false,
    "backdrop_path": "/x7jZHALUR58sAzEw0Ms9ohfapP8.jpg",
    "belongs_to_collection": null,
    "budget": 0,
    "genres": [
      {
        "id": 28,
        "name": "Action"
      },
      {
        "id": 35,
        "name": "Comedy"
      }
    ],
    "homepage": "",
    "id": 1439713,
    "imdb_id": "tt28629017",
    "origin_country": ["IN"],
    "original_language": "te",
    "original_title": "మన శంకర వరప్రసాద్ గారు",
    "overview": "National security officer Vara Prasad...",
    "popularity": 6.1766,
    "poster_path": "/sfj6SLSzbzHN2633HcqabHFJz5y.jpg",
    "production_companies": [...],
    "production_countries": [...],
    "release_date": "2026-01-11",
    "revenue": 0,
    "runtime": 162,
    "spoken_languages": [...],
    "status": "Released",
    "tagline": "Pandagaki Vastunnaru",
    "title": "Mana ShankaraVaraPrasad Garu",
    "video": false,
    "vote_average": 5.8,
    "vote_count": 4
  },
  "roast": {
    "headline": "The Bold Headline",
    "content": "The satirical content...",
    "chips": [
      "Cult Weirdos",
      "Zombie Naps"
    ],
    "internet_vibe": [
      "Waste of 3 hours, wanted to walk out",
      "So bad it's hilarious, watched twice",
      "People hate this but action scenes are amazing",
      "Zero sense but I enjoyed every minute",
      "Critics are wrong, this is actually good",
      "First half great, second half what happened?"
    ],
    "your_opinion": "Why you should or shouldn't watch",
    "similar_movies": [
      "Movie 1 - same genre, different tone",
      "Movie 2 - similar themes explored",
      "Movie 3 - comparable style",
      "Movie 4 - related subject matter"
    ]
  },
  "generated_at": "2026-01-17T10:30:00.000Z",
  "disclaimer": "Satire. Facts unchanged.",
  "truth_source": "perplexity",
  "truth_fetched_at": "2026-01-17T10:29:45.000Z"
}
```

**Cache Behavior:**
- Roasts are cached with TTL (configurable, typically 7 days)
- If cached: `"cached": true` in response
- If generated: `"cached": false` in response

**Processing Flow:**
1. Checks ROAST_KV cache for existing roast
2. If not cached:
   - Fetches movie details from TMDB
   - Gets/creates movie truth from Perplexity (cached separately)
   - Generates satirical roast using Grok
   - Stores roast in ROAST_KV
   - Stores debug payload in DEBUG_KV

---

#### 2. Get Movie Debug Data

Retrieves all debug payloads for a specific movie (includes raw API responses, metadata, and processing information).

**Endpoint:** `GET /movie/{tmdbId}/debug`

**Parameters:**
- `tmdbId` (path) - TMDB movie ID

**Example Request:**
```bash
curl -H "x-api-key: your-key" \
  https://api.plotburn.com/movie/1439713/debug
```

**Response (200 OK):**
```json
{
  "movieId": "1439713",
  "count": 2,
  "entries": [
    {
      "key": "debug:v1:movie:1439713:1737115800000-xyz",
      "data": {
        "movie": { /* Full TMDB response */ },
        "movieMeta": { /* Processed metadata */ },
        "truth": { /* Perplexity response with citations */ },
        "roast": { /* Generated roast */ },
        "result": { /* Final response */ },
        "correlationId": "1737115800000-xyz",
        "timestamp": "2026-01-17T10:30:00.000Z"
      }
    }
  ]
}
```

**Use Cases:**
- Debugging movie processing
- Analyzing AI responses
- Tracking processing history
- Reviewing citations and sources

---

### Now Playing & Feed

#### 3. Get Now Playing Movies

Fetches currently playing movies in theaters (from TMDB).

**Endpoint:** `GET /now-playing`

**Example Request:**
```bash
curl -H "x-api-key: your-key" \
  https://api.plotburn.com/now-playing
```

**Response (200 OK):**
```json
{
  "cached": true,
  "page": 1,
  "total_pages": 5,
  "total_results": 100,
  "dates": {
    "maximum": "2026-02-07",
    "minimum": "2025-12-25"
  },
  "movies": [
    {
      "id": 1439713,
      "title": "Mana ShankaraVaraPrasad Garu",
      "release_date": "2026-01-11",
      "rating": 5.8,
      "votes": 4,
      "popularity": 6.1766,
      "overview": "National security officer...",
      "poster_url": "https://image.tmdb.org/t/p/w500/sfj6SLSzbzHN2633HcqabHFJz5y.jpg",
      "has_roast": false
    }
  ]
}
```

**Cache Behavior:**
- Cached with TTL (typically 6 hours)
- Returns `"cached": true` when served from cache

---

#### 4. Feed Endpoint (Multi-Mode)

Unified feed endpoint with multiple modes for accessing different data types.

**Endpoint:** `GET /feed`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | `all` | Feed type: `now-playing`, `roast`, `truth`, `all` |
| `page` | integer | `1` | Page number (for pagination) |
| `limit` | integer | `10` | Results per page (max: 100) |
| `id` | integer | - | Specific movie ID (overrides pagination) |

---

##### 4.1 Feed: Now Playing

**Request:**
```bash
curl -H "x-api-key: your-key" \
  "https://api.plotburn.com/feed?type=now-playing"
```

**Response:**
```json
{
  "type": "now-playing",
  "total": 100,
  "movies": [...],
  "dates": {
    "maximum": "2026-02-07",
    "minimum": "2025-12-25"
  }
}
```

---

##### 4.2 Feed: Roasts (Paginated)

**Request:**
```bash
curl -H "x-api-key: your-key" \
  "https://api.plotburn.com/feed?type=roast&page=1&limit=10"
```

**Response:**
```json
{
  "type": "roast",
  "page": 1,
  "limit": 10,
  "total": 50,
  "total_pages": 5,
  "results": [
    {
      "movie": { /* MovieMeta */ },
      "roast": { /* Roast content */ },
      "generated_at": "2026-01-17T10:30:00.000Z",
      "disclaimer": "Satire. Facts unchanged.",
      "truth_source": "perplexity",
      "truth_fetched_at": "2026-01-17T10:29:45.000Z"
    }
  ]
}
```

---

##### 4.3 Feed: Truth Data (Paginated)

**Request:**
```bash
curl -H "x-api-key: your-key" \
  "https://api.plotburn.com/feed?type=truth&page=1&limit=10"
```

**Response:**
```json
{
  "type": "truth",
  "page": 1,
  "limit": 10,
  "total": 50,
  "total_pages": 5,
  "results": [
    {
      "source": "perplexity",
      "fetchedAt": "2026-01-17T10:29:45.000Z",
      "model": "llama-3.1-sonar-large-128k-online",
      "costEstimateINR": 2.5,
      "citations": [
        "https://example.com/review1",
        "https://example.com/review2"
      ],
      "searchResults": [
        {
          "title": "Movie Review",
          "url": "https://example.com/review1",
          "date": "2026-01-15",
          "snippet": "This movie..."
        }
      ],
      "content": "Comprehensive analysis...",
      "raw": "Raw Perplexity response...",
      "usage": {
        "prompt_tokens": 150,
        "completion_tokens": 500,
        "total_tokens": 650,
        "cost": { /* Cost breakdown */ }
      }
    }
  ]
}
```

---

##### 4.4 Feed: All Data (Combined)

Fetches now-playing movies with their roasts and truth data combined.

**Request:**
```bash
curl -H "x-api-key: your-key" \
  "https://api.plotburn.com/feed?type=all&page=1&limit=10"
```

**Response:**
```json
{
  "type": "all",
  "page": 1,
  "limit": 10,
  "total": 100,
  "total_pages": 10,
  "results": [
    {
      "id": 1439713,
      "title": "Mana ShankaraVaraPrasad Garu",
      "release_date": "2026-01-11",
      "rating": 5.8,
      "votes": 4,
      "popularity": 6.1766,
      "overview": "...",
      "poster_url": "https://...",
      "has_roast": true,
      "roast": {
        "headline": "...",
        "content": "...",
        "chips": ["...", "..."],
        "internet_vibe": ["...", "...", "...", "...", "...", "..."],
        "your_opinion": "...",
        "similar_movies": ["...", "...", "...", "..."]
      },
      "roast_generated_at": "2026-01-17T10:30:00.000Z",
      "truth": "Comprehensive analysis...",
      "truth_fetched_at": "2026-01-17T10:29:45.000Z"
    }
  ]
}
```

---

##### 4.5 Feed: Specific Movie

Get roast or truth for a specific movie ID.

**Request (Roast):**
```bash
curl -H "x-api-key: your-key" \
  "https://api.plotburn.com/feed?id=1439713&type=roast"
```

**Request (Truth):**
```bash
curl -H "x-api-key: your-key" \
  "https://api.plotburn.com/feed?id=1439713&type=truth"
```

**Response:** Returns the specific roast or truth data for that movie.

---

### Cache Management

#### 5. Clear Now Playing Cache

**Endpoint:** `DELETE /cache/clear/now-playing`

**Example Request:**
```bash
curl -X DELETE -H "x-api-key: your-key" \
  https://api.plotburn.com/cache/clear/now-playing
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Now-playing cache cleared"
}
```

---

#### 6. Clear Roast Cache

**Endpoint:** `DELETE /cache/clear/roast`

**Example Request:**
```bash
curl -X DELETE -H "x-api-key: your-key" \
  https://api.plotburn.com/cache/clear/roast
```

**Response (200 OK):**
```json
{
  "success": true,
  "deleted": 42,
  "message": "Roast cache cleared"
}
```

---

#### 7. Clear Truth Cache

**Endpoint:** `DELETE /cache/clear/truth`

**Example Request:**
```bash
curl -X DELETE -H "x-api-key: your-key" \
  https://api.plotburn.com/cache/clear/truth
```

**Response (200 OK):**
```json
{
  "success": true,
  "deleted": 42,
  "message": "Truth cache cleared"
}
```

---

#### 8. Clear All Caches

Clears all KV namespaces (NOW_PLAYING_KV, ROAST_KV, TRUTH_KV).

**Endpoint:** `DELETE /cache/clear/all`

**Example Request:**
```bash
curl -X DELETE -H "x-api-key: your-key" \
  https://api.plotburn.com/cache/clear/all
```

**Response (200 OK):**
```json
{
  "success": true,
  "cleared": {
    "now_playing": true,
    "roasts": 42,
    "truths": 42
  },
  "message": "All caches cleared"
}
```

---

### Cron Job Management

#### 9. Trigger Daily Roast Generation

Manually triggers the daily cron job that generates roasts for all now-playing movies.

**Endpoint:** `POST /cron/trigger`

**Example Request:**
```bash
curl -X POST -H "x-api-key: your-key" \
  https://api.plotburn.com/cron/trigger
```

**Response (202 Accepted):**
```json
{
  "message": "Cron job started in background",
  "correlation_id": "manual-trigger-1737115800000",
  "status": "started",
  "check_status_at": "/cron/status"
}
```

**Notes:**
- Returns immediately with 202 status
- Job runs in background using ExecutionContext.waitUntil()
- Check status using `/cron/status` endpoint
- Processes movies sequentially with rate limiting (5s delay between movies)

---

#### 10. Get Cron Job Status

Retrieves the status of the last cron run and execution history.

**Endpoint:** `GET /cron/status`

**Example Request:**
```bash
curl -H "x-api-key: your-key" \
  https://api.plotburn.com/cron/status
```

**Response (200 OK):**
```json
{
  "last_run": {
    "timestamp": "2026-01-17T10:00:00.000Z",
    "trigger": "scheduled",
    "correlation_id": "cron-1737115200000",
    "movies_fetched": 100,
    "roasts_processed": 100,
    "roasts_cached": 80,
    "roasts_generated": 20,
    "roasts_failed": 0,
    "failed_movie_ids": [],
    "duration_ms": 125000,
    "status": "success"
  },
  "history": [
    {
      "timestamp": "2026-01-17T10:00:00.000Z",
      "trigger": "scheduled",
      "correlation_id": "cron-1737115200000",
      "movies_fetched": 100,
      "roasts_processed": 100,
      "roasts_cached": 80,
      "roasts_generated": 20,
      "roasts_failed": 0,
      "failed_movie_ids": [],
      "duration_ms": 125000,
      "status": "success"
    }
  ],
  "total_runs": 10
}
```

**Status Values:**
- `in_progress` - Job is currently running
- `success` - All movies processed successfully
- `partial` - Some movies succeeded, some failed
- `failed` - All movies or the job itself failed

**Trigger Values:**
- `scheduled` - Triggered by Cloudflare cron trigger
- `manual` - Triggered via `/cron/trigger` endpoint

---

### Logging & Debug

#### 11. Get Logs

Retrieves application logs with optional filtering.

**Endpoint:** `GET /logs`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | `100` | Max logs to return (1-1000) |
| `level` | string | - | Filter by log level: `INFO`, `WARN`, `ERROR` |
| `correlationId` | string | - | Filter by correlation ID |

**Example Request:**
```bash
curl -H "x-api-key: your-key" \
  "https://api.plotburn.com/logs?limit=50&level=ERROR"
```

**Response (200 OK):**
```json
{
  "total": 5,
  "logs": [
    {
      "timestamp": "2026-01-17T10:30:00.000Z",
      "level": "ERROR",
      "endpoint": "/movie/1439713",
      "method": "GET",
      "statusCode": 500,
      "metadata": {
        "correlationId": "1737115800000-xyz",
        "movieId": "1439713",
        "error": "Failed to fetch from Perplexity"
      }
    }
  ],
  "note": "Logs auto-expire after 7 days"
}
```

**Log Retention:**
- Logs are stored in LOG_KV with TTL
- Default retention: 7 days (configurable via LOG_RETENTION_DAYS)
- Automatic cleanup via KV TTL

---

#### 12. Clear Old Logs

Manually clears logs older than specified days (TTL handles this automatically).

**Endpoint:** `DELETE /logs`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `olderThanDays` | integer | `30` | Delete logs older than N days |

**Example Request:**
```bash
curl -X DELETE -H "x-api-key: your-key" \
  "https://api.plotburn.com/logs?olderThanDays=30"
```

**Response (200 OK):**
```json
{
  "success": true,
  "deleted_count": 150,
  "message": "Cleared 150 logs older than 30 days",
  "note": "Logs are also auto-cleared after 7 days via TTL"
}
```

---

#### 13. Get Debug Data by Correlation ID

Retrieves debug entries for a specific correlation ID across all movies.

**Endpoint:** `GET /debug?correlationId={id}`

**Query Parameters:**
- `correlationId` (required) - Correlation ID to search for

**Example Request:**
```bash
curl -H "x-api-key: your-key" \
  "https://api.plotburn.com/debug?correlationId=1737115800000-xyz"
```

**Response (200 OK):**
```json
{
  "correlationId": "1737115800000-xyz",
  "count": 1,
  "entries": [
    {
      "key": "debug:v1:movie:1439713:1737115800000-xyz",
      "data": {
        "movie": { /* Full TMDB response */ },
        "movieMeta": { /* Processed metadata */ },
        "truth": { /* Perplexity response */ },
        "roast": { /* Generated roast */ },
        "result": { /* Final response */ },
        "correlationId": "1737115800000-xyz",
        "timestamp": "2026-01-17T10:30:00.000Z"
      }
    }
  ]
}
```

**Use Cases:**
- Debugging specific requests across multiple movies
- Tracing request flow through the system
- Analyzing cron job executions

---

## Response Formats

### MovieMeta Object

Complete movie metadata from TMDB:

```json
{
  "adult": false,
  "backdrop_path": "/x7jZHALUR58sAzEw0Ms9ohfapP8.jpg",
  "belongs_to_collection": null,
  "budget": 0,
  "genres": [
    { "id": 28, "name": "Action" },
    { "id": 35, "name": "Comedy" }
  ],
  "homepage": "",
  "id": 1439713,
  "imdb_id": "tt28629017",
  "origin_country": ["IN"],
  "original_language": "te",
  "original_title": "మన శంకర వరప్రసాద్ గారు",
  "overview": "National security officer Vara Prasad...",
  "popularity": 6.1766,
  "poster_path": "/sfj6SLSzbzHN2633HcqabHFJz5y.jpg",
  "production_companies": [
    {
      "id": 100071,
      "logo_path": null,
      "name": "Shine Screens",
      "origin_country": "IN"
    }
  ],
  "production_countries": [
    { "iso_3166_1": "IN", "name": "India" }
  ],
  "release_date": "2026-01-11",
  "revenue": 0,
  "runtime": 162,
  "spoken_languages": [
    {
      "english_name": "Telugu",
      "iso_639_1": "te",
      "name": "తెలుగు"
    }
  ],
  "status": "Released",
  "tagline": "Pandagaki Vastunnaru",
  "title": "Mana ShankaraVaraPrasad Garu",
  "video": false,
  "vote_average": 5.8,
  "vote_count": 4
}
```

### Roast Object

Satirical movie roast generated by Grok:

```json
{
  "headline": "Bold, attention-grabbing headline (max 12 words)",
  "content": "Main satirical content - three tight paragraphs with natural flow (130-150 words)",
  "chips": [
    "Cult Weirdos",
    "Zombie Naps"
  ],
  "internet_vibe": [
    "Waste of 3 hours, wanted to walk out",
    "So bad it's hilarious, watched twice",
    "People hate this but action scenes are amazing",
    "Zero sense but I enjoyed every minute",
    "Critics are wrong, this is actually good",
    "First half great, second half what happened?"
  ],
  "your_opinion": "Direct take on who should watch (max 65 words)",
  "similar_movies": [
    "Movie 1 - same genre, different tone",
    "Movie 2 - similar themes explored",
    "Movie 3 - comparable style",
    "Movie 4 - related subject matter"
  ]
}
```

**Field Constraints:**
| Field | Constraint |
|-------|------------|
| `headline` | Max 12 words |
| `content` | Max 150 words (aim for 130-150) |
| `chips` | Exactly 2-3 items, each 2-4 words (memorable, meme-worthy tags) |
| `internet_vibe` | Exactly 6 items, max 12 words each (real internet reactions) |
| `your_opinion` | Max 65 words |
| `similar_movies` | Exactly 4 items, context max 8 words each (neutral similarity, not "better than") |

### MovieTruth Object

Fact-checked information from Perplexity:

```json
{
  "source": "perplexity",
  "fetchedAt": "2026-01-17T10:29:45.000Z",
  "model": "llama-3.1-sonar-large-128k-online",
  "costEstimateINR": 2.5,
  "citations": [
    "https://example.com/review1",
    "https://example.com/review2"
  ],
  "searchResults": [
    {
      "title": "Movie Review Title",
      "url": "https://example.com/review1",
      "date": "2026-01-15",
      "snippet": "Brief excerpt from the source"
    }
  ],
  "content": "Comprehensive fact-checked analysis...",
  "raw": "Raw Perplexity API response...",
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 500,
    "total_tokens": 650,
    "search_context_size": "large",
    "cost": {
      "input_tokens_cost": 0.0001,
      "output_tokens_cost": 0.0002,
      "request_cost": 0.0003,
      "total_cost": 0.0003
    }
  }
}
```

---

## Error Handling

### Standard Error Response

```json
{
  "error": "Error category",
  "message": "Detailed error message"
}
```

### Common HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | OK | Request succeeded |
| 202 | Accepted | Async operation started (cron trigger) |
| 400 | Bad Request | Invalid parameters or missing required fields |
| 401 | Unauthorized | Missing or invalid API key |
| 404 | Not Found | Movie, roast, or resource not found |
| 500 | Internal Server Error | API failures, processing errors |

### Example Error Responses

**401 Unauthorized:**
```json
{
  "error": "Unauthorized",
  "message": "Missing x-api-key header"
}
```

**404 Not Found:**
```json
{
  "error": "Roast not found for this movie"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error",
  "message": "Failed to fetch from TMDB API"
}
```

---

## Rate Limiting

### External API Rate Limits

The API is subject to rate limits from external services:

- **TMDB API**: 40 requests per 10 seconds
- **Perplexity API**: Pay-per-use (no hard limit, but cost-based)
- **Grok API**: Pay-per-use (no hard limit, but cost-based)

### Cron Job Rate Limiting

When processing multiple movies via cron:
- 5 second delay between each movie (configurable via CRON_DELAY_MS)
- Sequential processing to avoid overwhelming external APIs
- Failed movies don't stop processing of remaining movies

### Recommendations

- Cache responses whenever possible
- Use the `/feed?type=all` endpoint to get bulk data efficiently
- Don't poll the `/movie/{id}` endpoint repeatedly - roasts are cached
- Use the cron job to pre-generate roasts during off-peak hours

---

## KV Storage Structure

### Namespaces

| Namespace | Purpose | TTL |
|-----------|---------|-----|
| NOW_PLAYING_KV | Stores now-playing movies list | 6 hours |
| ROAST_KV | Stores generated movie roasts | 7 days |
| TRUTH_KV | Stores Perplexity truth data | 30 days |
| LOG_KV | Stores application logs | 7 days |
| DEBUG_KV | Stores debug payloads | No TTL (manual cleanup) |
| CRON_KV | Stores cron execution history | No TTL |

### Key Patterns

```
now-playing:v1:latest
roast:v1:movie:{tmdbId}
truth:v1:movie:{tmdbId}
log:v1:{timestamp}-{random}
debug:v1:movie:{tmdbId}:{correlationId}
cron:v1:last-run
cron:v1:history
```

---

## Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| TMDB_API_KEY | string | TMDB API key |
| XAI_API_KEY | string | Grok (xAI) API key |
| PERPLEXITY_API_KEY | string | Perplexity API key |
| API_SECRET_KEY | string | API authentication key |
| KV_VERSION | string | KV namespace version (default: "v1") |
| LOG_RETENTION_DAYS | number | Log retention period (default: 7) |

---

## Best Practices

1. **Always use correlation IDs** for request tracing
2. **Cache aggressively** - don't regenerate roasts unnecessarily
3. **Monitor costs** - Perplexity and Grok are pay-per-use
4. **Use the feed endpoint** for bulk operations
5. **Check cron status** before manually triggering
6. **Store API keys securely** - never commit to version control
7. **Use debug endpoints** for troubleshooting, not production
8. **Clean up old debug data** periodically (no TTL on DEBUG_KV)

---

## Support & Contact

For issues, questions, or feature requests, please contact the PlotBurn team.

**API Version:** v1
**Last Updated:** 2026-01-17
