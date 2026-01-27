# PlotBurn Movie API Documentation

## Overview

PlotBurn Movie API is a Cloudflare Workers-based API that generates satirical movie roasts using AI. It integrates with:
- **TMDB API** - Movie metadata
- **Brave Search API** - Web search for movie facts and reviews
- **Claude API** - Satirical content generation

The API uses D1 (SQLite) as the primary database and includes a daily cron job to pre-generate roasts for now-playing and popular movies.

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

## Base URL

```
https://your-worker.workers.dev
```

## Common Headers

| Header | Required | Description |
|--------|----------|-------------|
| `x-api-key` | Yes | API authentication key |
| `x-correlation-id` | No | Custom correlation ID for request tracking (auto-generated if not provided) |

## Endpoints

### 1. Get Now Playing Movies

Fetches currently playing movies in theaters (from TMDB) and updates the database.

**Endpoint:** `GET /now-playing`

**Example Request:**
```bash
curl -H "x-api-key: your-key" https://api.plotburn.com/now-playing
```

**Response (200 OK):**
```json
{
  "cached": false,
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
      "title": "Movie Title",
      "release_date": "2026-01-11",
      "rating": 5.8,
      "votes": 4,
      "popularity": 6.17,
      "overview": "Movie description...",
      "poster_url": "https://image.tmdb.org/t/p/w500/poster.jpg",
      "has_roast": false
    }
  ]
}
```

**Database Operations:**
1. Fetches movies from TMDB API
2. Clears all existing entries from 'now_playing' category
3. Upserts each movie to the `movies` table (preserves existing popularity scores)
4. Adds each movie to the 'now_playing' category

### 2. Get Popular Movies

Fetches currently popular movies (from TMDB) and updates the database. Always returns fresh data with updated popularity scores.

**Endpoint:** `GET /popular`

**Example Request:**
```bash
curl -H "x-api-key: your-key" https://api.plotburn.com/popular
```

**Response (200 OK):**
```json
{
  "cached": false,
  "page": 1,
  "total_pages": 500,
  "total_results": 10000,
  "movies": [
    {
      "id": 123456,
      "title": "Popular Movie",
      "release_date": "2026-01-15",
      "rating": 7.5,
      "votes": 1500,
      "popularity": 125.5,
      "overview": "Movie description...",
      "poster_url": "https://image.tmdb.org/t/p/w500/poster.jpg",
      "has_roast": false
    }
  ]
}
```

**Database Operations:**
1. Fetches movies from TMDB API
2. Clears all existing entries from 'popular' category
3. Upserts each movie to the `movies` table (updates popularity scores)
4. Adds each movie to the 'popular' category

### 3. Get Movie Roast

Generates or retrieves a cached satirical roast for a specific movie.

**Endpoint:** `GET /movie/{tmdbId}`

**Parameters:**
- `tmdbId` (path) - TMDB movie ID

**Example Request:**
```bash
curl -H "x-api-key: your-key" https://api.plotburn.com/movie/1439713
```

**Response (200 OK):**
```json
{
  "cached": false,
  "movie": {
    "id": 1439713,
    "title": "Movie Title",
    "release_date": "2026-01-11",
    "vote_average": 5.8,
    "vote_count": 4,
    "popularity": 6.17,
    "poster_path": "/poster.jpg",
    "overview": "Movie description..."
  },
  "roast": {
    "headline": "Bold Satirical Headline",
    "roast": "The satirical content - three paragraphs of witty commentary...",
    "chips": ["Cult Classic", "Mind Bender"],
    "internet_vibe": [
      "Comment from the internet",
      "Another perspective",
      "Third viewpoint",
      "Fourth opinion",
      "Fifth take",
      "Sixth reaction"
    ],
    "your_opinion": "Direct take on who should watch this movie...",
    "similar_movies": [
      "Similar Movie 1 - brief context",
      "Similar Movie 2 - brief context",
      "Similar Movie 3 - brief context",
      "Similar Movie 4 - brief context"
    ]
  },
  "generated_at": "2026-01-27T10:30:00.000Z"
}
```

**Processing Flow:**
1. Checks D1 database for existing roast
2. If not found:
   - Fetches movie details from TMDB
   - Searches web for facts via Brave Search
   - Generates satirical roast using Claude
   - Stores roast in D1 database

### 4. Get Movie Truth (Facts)

Retrieves or generates fact-checked information about a movie using Brave Search and Claude.

**Endpoint:** `GET /movie/{tmdbId}/truth`

**Parameters:**
- `tmdbId` (path) - TMDB movie ID

**Example Request:**
```bash
curl -H "x-api-key: your-key" https://api.plotburn.com/movie/1439713/truth
```

**Response (200 OK):**
```json
{
  "cached": false,
  "movie": {
    "id": 1439713,
    "title": "Movie Title"
  },
  "truth": {
    "source": "brave-extraction",
    "model": "claude-sonnet-4-20250514",
    "fetched_at": "2026-01-27T10:29:45.000Z",
    "content": {
      "plot_summary": "Brief plot overview...",
      "critical_reception": "How critics received the film...",
      "audience_reaction": "Public response...",
      "notable_aspects": ["Aspect 1", "Aspect 2"],
      "controversies": "Any controversies if applicable..."
    }
  }
}
```

### 5. Trigger Cron Job

Manually triggers the daily cron job that generates roasts for now-playing and popular movies.

**Endpoint:** `POST /cron/trigger`

**Example Request:**
```bash
curl -X POST -H "x-api-key: your-key" https://api.plotburn.com/cron/trigger
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

**Cron Job Flow:**
1. **Fetch Now Playing** - Calls `/now-playing` handler which:
   - Fetches from TMDB
   - Clears 'now_playing' category in DB
   - Upserts movies (preserves popularity)
   - Adds movies to 'now_playing' category
2. **Fetch Popular** - Calls `/popular` handler which:
   - Fetches from TMDB
   - Clears 'popular' category in DB
   - Upserts movies (updates popularity scores)
   - Adds movies to 'popular' category
3. **Merge & Deduplicate** - Combines both lists:
   - Now-playing movies added first
   - Popular movies added second (overwrites duplicates)
   - Results in unique movie list with fresh popularity scores
4. **Generate Roasts** - For each unique movie:
   - Checks if roast exists in DB
   - If not, fetches facts via Brave Search + Claude
   - Generates roast via Claude
   - Stores roast in DB
   - 500ms delay between movies

**Notes:**
- Returns immediately with 202 status
- Job runs in background using ExecutionContext.waitUntil()
- Rate-limited: 500ms delay between movies (CRON_DELAY_MS)
- Failed movies don't stop processing of remaining movies

### 6. Get Cron Job Status

Returns information about cron job status.

**Endpoint:** `GET /cron/status`

**Example Request:**
```bash
curl -H "x-api-key: your-key" https://api.plotburn.com/cron/status
```

**Response (200 OK):**
```json
{
  "message": "Cron status history is no longer stored in KV. Check server logs."
}
```

## Response Formats

### Movie Object

```json
{
  "id": 1439713,
  "title": "Movie Title",
  "release_date": "2026-01-11",
  "popularity": 6.17,
  "vote_average": 5.8,
  "vote_count": 4,
  "poster_path": "/poster.jpg",
  "overview": "Movie description..."
}
```

### Roast Object

```json
{
  "headline": "Bold, attention-grabbing headline (max 12 words)",
  "roast": "Main satirical content (130-150 words)",
  "chips": ["Tag 1", "Tag 2"],
  "internet_vibe": [
    "Comment 1", "Comment 2", "Comment 3",
    "Comment 4", "Comment 5", "Comment 6"
  ],
  "your_opinion": "Direct take on who should watch (max 65 words)",
  "similar_movies": [
    "Movie 1 - context",
    "Movie 2 - context",
    "Movie 3 - context",
    "Movie 4 - context"
  ]
}
```

**Field Constraints:**
| Field | Constraint |
|-------|------------|
| `headline` | Max 12 words |
| `roast` | 130-150 words |
| `chips` | 2-3 items, 2-4 words each |
| `internet_vibe` | Exactly 6 items, max 12 words each |
| `your_opinion` | Max 65 words |
| `similar_movies` | Exactly 4 items |

## Error Handling

### Standard Error Response

```json
{
  "error": "Error category",
  "message": "Detailed error message"
}
```

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | OK | Request succeeded |
| 202 | Accepted | Async operation started (cron trigger) |
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Missing or invalid API key |
| 404 | Not Found | Movie or resource not found |
| 500 | Internal Server Error | API failures, processing errors |

## Rate Limiting

### External API Rate Limits

- **TMDB API**: 40 requests per 10 seconds
- **Brave Search API**: Pay-per-use
- **Claude API**: Pay-per-use

### Cron Job Rate Limiting

- 500ms delay between each movie (configurable via CRON_DELAY_MS)
- Sequential processing to avoid overwhelming external APIs
- Failed movies don't stop processing of remaining movies

## Database Schema

The API uses Cloudflare D1 (SQLite) with the following tables:

### movies
Stores movie metadata from TMDB.
- `id` - TMDB movie ID (primary key)
- `title`, `release_date`, `popularity`, `vote_average`, `vote_count`, `poster_path`
- `language` - ISO 639-1 code (default: 'en')
- `created_at`, `updated_at` - Unix timestamps

### movie_categories
Junction table for many-to-many relationship between movies and categories.
- `movie_id` - Foreign key to movies
- `category` - Category name: 'now_playing', 'popular', 'upcoming', 'top_rated'
- `added_at` - When movie was added to this category
- Primary key: (movie_id, category)

**Category Refresh Logic:**
- When `/now-playing` is called: clears all 'now_playing' entries, then adds current movies
- When `/popular` is called: clears all 'popular' entries, then adds current movies
- A movie can be in multiple categories simultaneously

### roasts
Stores generated AI roasts with soft versioning (multiple versions per movie).
- `id` - Auto-increment ID
- `movie_id` - Foreign key to movies
- `roast_json` - JSON string containing roast content
- `language` - ISO 639-1 code
- `is_active` - Only one active roast per movie+language (enforced by unique index)
- `is_featured` - For highlighting/pinning

### extractions
Stores Brave Search + Claude extraction results (movie facts).
- `id` - Auto-increment ID
- `movie_id` - Foreign key to movies
- `source`, `model` - Source and model used
- `content_json` - Extracted facts as JSON
- `evidence_json` - Raw search results
- `citations_json` - Source URLs
- Token usage and cost tracking

### streaming_providers
Stores streaming availability data (future use).

## Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| TMDB_API_KEY | string | TMDB API key |
| ANTHROPIC_API_KEY | string | Claude API key |
| BRAVE_API_KEY | string | Brave Search API key |
| API_SECRET_KEY | string | API authentication key |
| KV_VERSION | string | Version prefix (default: "v1") |

## Cron Schedule

- **Expression**: `30 16 * * *`
- **Time**: 10:00 PM IST (4:30 PM UTC)
- **Frequency**: Once daily
- **Movies processed**: Now-playing + Popular (deduplicated)

---

**API Version:** v1
**Last Updated:** 2026-01-27
