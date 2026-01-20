# API Authentication Setup

## Overview
The PlotBurn API uses header-based authentication to protect endpoints. Authentication is required for all endpoints except public read-only endpoints.

## Setting Up API Key

### 1. Generate a Secure API Key

Generate a strong random API key:

```bash
# Using openssl
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using PowerShell
[Convert]::ToBase64String([byte[]]@(1..32 | ForEach-Object {Get-Random -Minimum 0 -Maximum 256}))
```

Example output: `hK9xP4tR2mL8sN5vQ7wY1zC3bA6dF0gJ4hM8nP2qS5tV7wX9yZ1aC3bE6fG0hJ4k`

### 2. Set the Secret in Cloudflare

**Option A: Via Wrangler CLI (Recommended)**
```bash
# Set the secret (will be encrypted and stored securely)
npx wrangler secret put API_SECRET_KEY

# When prompted, paste your generated API key
# Press Enter
```

**Option B: Via Cloudflare Dashboard**
1. Go to Cloudflare Dashboard
2. Navigate to Workers & Pages → plotburn-movie-api
3. Go to Settings → Variables
4. Under "Environment Variables", click "Add variable"
5. Set variable name: `API_SECRET_KEY`
6. Set variable type: **Secret** (encrypted)
7. Paste your generated API key as the value
8. Click "Deploy" to apply changes

**Option C: For Local Development**

Create a `.dev.vars` file in the project root:
```env
API_SECRET_KEY=your-local-api-key-here
TMDB_API_KEY=your-tmdb-key
XAI_API_KEY=your-xai-key
PERPLEXITY_API_KEY=your-perplexity-key
```

**Important:** Add `.dev.vars` to `.gitignore` to keep it private!

## Using the API

### All Endpoints Require Authentication

All API endpoints require the `x-api-key` header for authentication:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/now-playing` | GET | Get now-playing movies |
| `/feed` | GET | Get curated feed |
| `/movie/{tmdbId}` | GET | Get movie roast |
| `/cron/trigger` | POST | Manually trigger cron job |
| `/cron/status` | GET | Check cron status |
| `/logs` | GET | View logs |
| `/logs` | DELETE | Clear logs |
| `/debug` | GET | View debug data |
| `/cache/clear/*` | DELETE | Clear cache |

**Example (now-playing with auth):**
```bash
curl https://plotburn-movie-api.workers.dev/now-playing \
  -H "x-api-key: your-api-key-here"
```

**Example (cron trigger with auth):**
```bash
curl -X POST https://plotburn-movie-api.workers.dev/cron/trigger \
  -H "x-api-key: your-api-key-here"
```

**Example with correlation ID:**
```bash
curl https://plotburn-movie-api.workers.dev/cron/status \
  -H "x-api-key: your-api-key-here" \
  -H "x-correlation-id: my-request-123"
```

## Security Best Practices

### 1. Rotate API Keys Regularly
Change your API key every 3-6 months:
```bash
# Generate new key
openssl rand -base64 32

# Update in Cloudflare
npx wrangler secret put API_SECRET_KEY
# Paste new key
```

### 2. Use Different Keys for Different Environments
- Development: Use `.dev.vars` with a different key
- Production: Use Cloudflare secrets with a strong key

### 3. Never Commit Keys to Git
Add to `.gitignore`:
```
.dev.vars
.env
.env.*
```

### 4. Monitor Unauthorized Access
Check logs for 401 errors:
```bash
curl https://plotburn-movie-api.workers.dev/logs?level=ERROR \
  -H "x-api-key: your-api-key-here"
```

## Error Responses

### Missing API Key
```json
{
  "error": "Unauthorized",
  "message": "Missing x-api-key header"
}
```
**Status Code:** 401 Unauthorized

### Invalid API Key
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```
**Status Code:** 401 Unauthorized

## Testing Authentication

### 1. Test Without API Key (Should Fail)
```bash
curl https://plotburn-movie-api.workers.dev/now-playing
# Expected: 401 Unauthorized - Missing x-api-key header
```

### 2. Test With Invalid API Key (Should Fail)
```bash
curl https://plotburn-movie-api.workers.dev/now-playing \
  -H "x-api-key: wrong-key"
# Expected: 401 Unauthorized - Invalid API key
```

### 3. Test With Valid API Key (Should Work)
```bash
curl https://plotburn-movie-api.workers.dev/now-playing \
  -H "x-api-key: your-api-key-here"
# Expected: 200 OK with movie data
```

## Disabling Authentication (Development Only)

If `API_SECRET_KEY` is not set in the environment, authentication is **automatically disabled** with a warning in the logs:

```
API_SECRET_KEY is not configured - authentication disabled
```

**⚠️ Warning:** Never deploy to production without setting `API_SECRET_KEY`!

## Integration Examples

### JavaScript/Fetch
```javascript
const apiKey = 'your-api-key-here';

// Trigger cron
const response = await fetch('https://plotburn-movie-api.workers.dev/cron/trigger', {
  method: 'POST',
  headers: {
    'x-api-key': apiKey,
  },
});

const data = await response.json();
console.log(data);
```

### cURL
```bash
API_KEY="your-api-key-here"

curl -X POST https://plotburn-movie-api.workers.dev/cron/trigger \
  -H "x-api-key: $API_KEY"
```

### Python
```python
import requests

api_key = "your-api-key-here"
headers = {"x-api-key": api_key}

response = requests.post(
    "https://plotburn-movie-api.workers.dev/cron/trigger",
    headers=headers
)

print(response.json())
```

## Troubleshooting

### Issue: Authentication disabled warning in logs
**Solution:** Set `API_SECRET_KEY` using `wrangler secret put API_SECRET_KEY`

### Issue: 401 Unauthorized even with correct key
**Possible causes:**
1. Key was not deployed - run `wrangler deploy` after setting secrets
2. Key has spaces or special characters - ensure it's properly URL-encoded
3. Using wrong header name - must be `x-api-key` (lowercase)

### Issue: Need to make some endpoints public
**Solution:** Edit [src/utils/auth.ts](src/utils/auth.ts) and update the `isPublicEndpoint()` function to return `true` for specific paths

## Summary

- **All endpoints**: Require `x-api-key` header with valid secret
- **Setup**: Use `wrangler secret put API_SECRET_KEY` to configure
- **Security**: Rotate keys regularly, never commit to git
- **Development**: Use `.dev.vars` for local testing

Your API is now secured! 🔒
