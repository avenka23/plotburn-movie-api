/**
 * Claude API Service for PlotBurn Movie Roast Generation
 *
 * This service handles communication with the Anthropic Claude API to generate
 * humorous, satirical "roasts" of movies. It uses Claude's language capabilities
 * to create entertaining content that mocks movies in a fun, non-toxic way.
 *
 * The service implements prompt caching for cost optimization on repeated calls
 * and tracks recent roasts to avoid repetitive patterns.
 */

import type { Env, MovieMeta, MovieTruth } from '../types';
import { Logger } from '../utils/logger';

/**
 * Retrieves recent roasts from KV storage to provide context for avoiding repetition
 */
async function getRecentRoasts(env: Env, limit: number = 5): Promise<string[]> {
    try {
        const stored = await env.RECENT_ROAST_KV.get('recent_roasts', 'json');
        if (!stored || !Array.isArray(stored)) {
            return [];
        }
        return stored.slice(-limit);
    } catch (error) {
        console.error('Failed to retrieve recent roasts:', error);
        return [];
    }
}

/**
 * Stores a new roast in KV storage for future reference
 */
async function storeRoast(env: Env, roast: string): Promise<void> {
    try {
        const existing = await env.RECENT_ROAST_KV.get('recent_roasts', 'json') || [];
        const updated = Array.isArray(existing) ? [...existing, roast] : [roast];
        
        // Keep only last 10 roasts to manage storage
        const trimmed = updated.slice(-10);
        
        await env.RECENT_ROAST_KV.put('recent_roasts', JSON.stringify(trimmed), {
            expirationTtl: 60 * 60 * 24 * 7 // Keep for 1 week
        });
    } catch (error) {
        console.error('Failed to store roast:', error);
    }
}

/**
 * Generates a satirical roast for a given movie using Claude API
 *
 * @param facts - Movie metadata from TMDB (title, genres, release date, etc.)
 * @param truth - Research data about the movie (plot summary, reception, etc.)
 * @param env - Environment variables containing API keys and configuration
 * @param correlationId - Unique identifier for request tracing and logging
 * @returns Promise containing the generated roast content as a parsed JSON object
 *
 * @example
 * const roast = await generateRoast(movieFacts, movieTruth, env, 'req-123');
 * // Returns: { headline, overview, roast, reception, chips, similar_movies, shareable_caption }
 */
export async function generateRoast(
    facts: MovieMeta,
    truth: MovieTruth,
    env: Env,
    correlationId: string
) {
    // Initialize logger for tracking API calls and debugging
    const logger = new Logger(env, '/api/claude/roast', 'POST', correlationId);

    // Retrieve recent roasts to avoid repetition
    const recentRoasts = await getRecentRoasts(env);

    // Construct the request body for Claude API
    // Using the Messages API format with system prompts and user messages
    const body = {
        model: 'claude-sonnet-4-5-20250929', // Claude Sonnet 4.5 model
        max_tokens: 1024, // Maximum response length
        temperature: 0.7, // Controls creativity (0.7 = balanced creativity/consistency)

        // System prompts define Claude's persona and behavior
        // Using array format to enable prompt caching with cache_control
        system: [
            {
                type: 'text',
                // Primary system prompt: Defines the "Cheerful Absurdist" persona
                // and establishes tone rules for roast generation
                text: `You are writing roasts for PlotBurn. Your persona is a "Cheerful Absurdist"—a friend who is delighted by how crazy the movie is.

YOUR GOAL:
Celebrate the sheer audacity of human imagination. Don't be mean; be entertained by the madness.

1. THE MAKERS: Mock their wild confidence.
   - "The writers sat in a room, looked at the laws of physics, and said 'Nah, not today.'"
   - Do NOT talk about money/profit. Focus on the creative decisions.
2. THE FANS: Mock our willingness to believe anything.
   - "We all agreed to pretend that cars can fly because it looked cool. We are a simple species."
3. THE CRITICS: Mock them for being buzzkills at a party.
   - "Critics are trying to find the logic. The logic left the building ten minutes ago. Just enjoy the fireworks."

WRITING STYLE:
- Write like you're texting a friend about a wild movie you just saw
- Use simple, everyday words anyone would understand
- Avoid film critic vocabulary, industry jargon, and fancy academic words
- Test: "Would I say this in a text message?" If no, simplify it.
- No money talk. No real names. Just focus on the wild story decisions.
- Avoid repetitive phrases like "my friend", "my brother", "but hey, at least the X slaps"
- Vary your opening style each time
- Don't fall into the formula: "Fans are [positive]... Critics are [negative]..."

REGIONAL RULES:
- If the movie is from a specific region (e.g., India, Korea), you MUST suggest similar movies from that region in the "similar_movies" list.
- Mix Global hits and Local hits.

SIMILAR MOVIE FORMAT:
- Be specific: mention actual plot elements, not vague descriptions
- GOOD: "horror-comedy with possessed cop fighting cybercriminals"
- BAD: "horror-comedy blending scares with laughs in stretched runtime"

You will receive raw research data about a movie. Parse it to understand:
1. PREMISE - What the movie is about
2. WHAT IT PROMISES - The obvious contract based on title/genre/marketing
3. HOW PEOPLE ARE REACTING - Critic/audience reactions and quotes
4. THE GAP - The disconnect between what it is vs what people expect
5. AUDIENCE RECEPTION - Score (1-10), label, reasoning, and sources`,
        cache_control: { 
          type: 'ephemeral',
          ttl: '1h'  // Cache for 1 hour to reduce costs during batch processing
        },
            },
            {
                type: 'text',
                // Secondary system prompt: Provides example roasts for different genres
                // These examples help Claude understand the desired voice and style
                text: `REFERENCE EXAMPLES - Study these for voice variety:

ACTION - Fast & Furious 9

The writers decided to send a Pontiac Fiero into outer space, and I honestly respect the audacity. They looked at gravity and said, "absolutely not." It is the most expensive cartoon ever made. The audience loved it, of course. We happily turned off our brains to watch Vin Diesel catch a car with his bare hands. The critics are confused. They are writing reviews about "plot holes." You are watching a movie where a car swings like Tarzan. The plot isn't a hole; it's a crater. And it's beautiful.

ROMANCE - After Series

A teenager wrote this on their phone during a math class, and Hollywood turned it into a blockbuster. That is an amazing fact. The filmmakers took a messy, toxic text thread and treated it like Romeo and Juliet. Fans are eating it up, ignoring every red flag because the lead actor is moody and the music is sad. You can't lecture this movie! It's purely powered by hormones and vibes. Trying to find a moral lesson here is like trying to find a salad at a candy store.

REGIONAL (TAMIL) - Vaa Vaathiyaar

This movie's concept is legendary. A cop is possessed by a dead superstar, and he fights hackers with the power of nostalgia. Everyone just agreed to make it! It is a wild fever dream. The story runs entirely on vibes and hero worship. A ghost is piloting a human body to beat up cyber-criminals. If you are looking for realism, you walked into the wrong party. Just sit back and enjoy the chaos.`,
                cache_control: { 
                  type: 'ephemeral',
                  ttl: '1h'  // Cache for 1 hour to reduce costs during batch processing
                },
            },
        ],

        // Messages array containing the user prompt with movie-specific data
        messages: [
            {
                role: 'user',
                // User prompt: Contains the actual movie data and output format specification
                // Template literals inject movie metadata and research content
                content: `${recentRoasts.length > 0 ? `
<recent_roasts>
Here are the last ${recentRoasts.length} roasts generated to help you avoid repetitive patterns:

${recentRoasts.join('\n\n---\n\n')}
</recent_roasts>

IMPORTANT: Make sure your new roast has a DIFFERENT opening style, structure, and closing than the examples above. Vary your vocabulary and avoid repeating phrases.

` : ''}Generate a PlotBurn roast for this movie.

**Movie:** ${facts.title} (${facts.release_date.split('-')[0]})
**Language:** ${facts.spoken_languages.find((l) => l.iso_639_1 === facts.original_language)?.english_name || facts.original_language}
**Genre:** ${facts.genres.length > 0 ? facts.genres.map((g) => g.name).join(', ') : 'film'}

**Note:** This movie was released on ${facts.release_date}. If you have training knowledge about it (released before January 2025), leverage that to enrich your roast with specific plot details, memorable scenes, or filmmaking choices. Otherwise, rely solely on the research data below.

**Research Data:**
Plot summary, critical reception, and audience reactions:

${truth.content}

---

**Generate the following as valid JSON:**

1. **headline** (10-15 words)
   - Mock the absurd premise or overserious takes
   - Make it punchy and shareable

2. **overview** (40-60 words, spoiler-free)
   - Describe premise matter-of-factly to highlight absurdity
   - Set up the disconnect

3. **roast** (100-130 words)
   - Mock the disconnect using the "Cheerful Absurdist" voice
   - Use GLOBALLY RECOGNIZABLE references only for comparisons
   - Focus on the wild decisions of Makers, Fans, and Critics
   - DO NOT mention money or profits. Focus on the psychology.
   - AVOID repetitive phrases and patterns from recent roasts

4. **reception** (JSON object)
   - Extract the score and label from the research data
   - bars: number (1-10)
   - label: string (from the scale: Avoid/Skip It/Mixed Bag/Worth Watching/Strong Approval/Universal Acclaim)

5. **chips** (array of EXACTLY 3 items)
   - Each chip must be EXACTLY 2 words
   - Capture the ridiculous criticism types
   - Examples: "Logic Police", "Vibe Check", "Zero Physics"
   - Format: ["Two Words", "Two Words", "Two Words"]

6. **similar_movies** (array of EXACTLY 4 items)
   - Describe what actually HAPPENS in the plot, not vague qualities
   - Answer: "What's that movie about?" not "What type of movie is it?"
   - BAD: "horror-comedy mixing scares with romance"
   - GOOD: "ghost woman kidnaps men, hero stops her"
   - Format: "Movie Title (Year) - plot premise in 8-12 words"

7. **shareable_caption** (8-12 words + #PlotBurn)
   - One-liner mocking the audience disconnect
   - Must end with #PlotBurn

**Return as valid JSON with these exact keys:**
{
  "headline": "string",
  "overview": "string",
  "roast": "string",
  "reception": {
    "bars": number,
    "label": "string"
  },
  "chips": ["Two Words", "Two Words", "Two Words"],
  "similar_movies": ["Movie (Year) - similarity", "Movie (Year) - similarity", "Movie (Year) - similarity", "Movie (Year) - similarity"],
  "shareable_caption": "string #PlotBurn"
}`,
            },
        ],
    };

    // Track API call duration for logging and monitoring
    const apiStartTime = Date.now();

    try {
        // Make the API request to Anthropic's Messages endpoint
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': env.CLAUDE_API_KEY, // API key from environment
                'anthropic-version': '2023-06-01', // API version header (required)
                'content-type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const apiDuration = Date.now() - apiStartTime;

        // Handle API errors (non-2xx responses)
        if (!res.ok) {
            const errorText = await res.text();
            // Log the failed API call for debugging
            await logger.logExternalAPICall(
                'Claude (Roast Generation)',
                {
                    movieId: facts.id.toString(),
                    movieTitle: facts.title,
                    model: 'claude-sonnet-4-5-20250929',
                    stage: 'roast',
                },
                undefined,
                `${res.status} ${res.statusText}: ${errorText}`,
                apiDuration
            );
            throw new Error(`Claude API failed: ${res.status} ${res.statusText}`);
        }

        // Parse the successful response
        // Type assertion for Claude's response structure
        const data = (await res.json()) as {
            content: { text: string }[]; // Array of content blocks (text responses)
            stop_reason: string; // Why generation stopped (e.g., 'end_turn', 'max_tokens')
            usage?: {
                // Token usage statistics for billing/monitoring
                cache_creation_input_tokens?: number; // Tokens written to cache
                cache_read_input_tokens?: number; // Tokens read from cache
                input_tokens?: number; // Total input tokens
                output_tokens?: number; // Total output tokens
            };
        };

        // Log successful API call with usage statistics
        await logger.logExternalAPICall(
            'Claude (Roast Generation)',
            {
                movieId: facts.id.toString(),
                movieTitle: facts.title,
                model: body.model,
                temperature: body.temperature,
                max_tokens: body.max_tokens,
                stage: 'roast',
                // Include cache statistics for monitoring prompt caching effectiveness
                cache_stats: {
                    cache_creation_input_tokens: data.usage?.cache_creation_input_tokens || 0,
                    cache_read_input_tokens: data.usage?.cache_read_input_tokens || 0,
                    input_tokens: data.usage?.input_tokens || 0,
                    output_tokens: data.usage?.output_tokens || 0,
                },
            },
            {
                response_length: data.content[0].text.length,
                stop_reason: data.stop_reason,
            },
            undefined,
            apiDuration
        );

        // Extract JSON from Claude's response text
        const responseText = data.content[0].text;

        // Claude sometimes wraps JSON in markdown code blocks (```json ... ```)
        // This regex handles both ```json and plain ``` blocks
        let jsonString = responseText;
        const jsonMatch =
            responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);

        if (jsonMatch) {
            jsonString = jsonMatch[1];
        } else {
            // No code blocks - extract JSON object by finding matching braces
            // This handles cases where Claude adds trailing text after the JSON
            const firstBrace = responseText.indexOf('{');
            if (firstBrace !== -1) {
                let braceCount = 0;
                let lastBrace = -1;
                for (let i = firstBrace; i < responseText.length; i++) {
                    if (responseText[i] === '{') braceCount++;
                    else if (responseText[i] === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            lastBrace = i;
                            break;
                        }
                    }
                }
                if (lastBrace !== -1) {
                    jsonString = responseText.substring(firstBrace, lastBrace + 1);
                }
            }
        }

        // Parse the JSON response
        const parsedRoast = JSON.parse(jsonString.trim());

        // Store the roast text for future repetition avoidance
        await storeRoast(env, parsedRoast.roast);

        return parsedRoast;
    } catch (error) {
        // Handle any errors during the API call or response processing
        const apiDuration = Date.now() - apiStartTime;

        // Log the error for debugging
        await logger.logExternalAPICall(
            'Claude (Roast Generation)',
            {
                movieId: facts.id.toString(),
                movieTitle: facts.title,
                model: 'claude-sonnet-4-5-20250929',
                stage: 'roast',
            },
            undefined,
            error instanceof Error ? error.message : String(error),
            apiDuration
        );

        // Re-throw the error to be handled by the caller
        throw error;
    }
}