/**
 * Claude API Service for PlotBurn Movie Roast Generation
 *
 * This service handles communication with the Anthropic Claude API to generate
 * humorous, satirical "roasts" of movies. It uses Claude's language capabilities
 * to create entertaining content that mocks movies in a fun, non-toxic way.
 *
 * The service implements prompt caching for cost optimization on repeated calls.
 */

import type { Env, MovieMeta, MovieTruth } from '../types';
import { Logger } from '../utils/logger';

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
   - "Critics are trying to find the logic. My friend, the logic left the building ten minutes ago. Just enjoy the fireworks."

TONE RULES:
- FUN & PUNCHY: High energy. Short sentences. Use exclamations!
- NON-TOXIC: We aren't angry; we are having a blast.
- NO MONEY TALK: Focus on the wild story decisions, not the box office.
- NO REAL NAMES: Use archetypes ("The director," "The lead," "The writers").

REGIONAL RULES:
- If the movie is from a specific region (e.g., India, Korea), you MUST suggest similar movies from that region in the "similar_movies" list.
- Mix Global hits and Local hits.

Reference rules:
- Use general global references

You will receive raw research data about a movie. Parse it to understand:
1. PREMISE - What the movie is about
2. WHAT IT PROMISES - The obvious contract based on title/genre/marketing
3. HOW PEOPLE ARE REACTING - Critic/audience reactions and quotes
4. THE GAP - The disconnect between what it is vs what people expect
5. AUDIENCE RECEPTION - Score (1-10), label, reasoning, and sources

SIMILAR MOVIE RULES:
- Generate 4 movies with similar plots, themes, or vibes
- MIX IT UP: If the input movie is Regional (e.g. Indian, Korean), you MUST include 2 Global hits and 2 Local/Regional hits.
- Format: "Movie Title (Year) - similarity explanation"`,
                // Enable prompt caching for this system prompt block
                // 'ephemeral' caching reduces costs on repeated API calls
                cache_control: { type: 'ephemeral' },
            },
            {
                type: 'text',
                // Secondary system prompt: Provides example roasts for different genres
                // These examples help Claude understand the desired voice and style
                text: `REFERENCE EXAMPLES - Study these for voice variety:

ACTION - Fast & Furious 9

The writers decided to send a Pontiac Fiero into outer space, and I honestly respect the audacity. They looked at gravity and said, "absolutely not." It is the most expensive cartoon ever made. The audience loved it, of course. We happily turned off our brains to watch Vin Diesel catch a car with his bare hands. Meanwhile, the critics are confused. They are writing reviews about "plot holes." My guy, you are watching a movie where a car swings like Tarzan. The plot isn't a hole; it's a crater. And it's beautiful.

ROMANCE - After Series

A teenager wrote this on their phone during a math class, and Hollywood turned it into a blockbuster. That is an amazing fact. The filmmakers took a messy, toxic text thread and treated it like Romeo and Juliet. The fans are eating it up, ignoring every red flag because the lead actor is brooding and the music is sad. Critics are stressing out about the "bad message." But you can't lecture this movie! It's purely powered by hormones and vibes. Trying to find a moral lesson here is like trying to find a salad at a candy store.

REGIONAL (TAMIL) - Vaa Vaathiyaar

The pitch for this movie must have been legendary. "Okay, so the cop is possessed by a dead superstar, and he fights hackers with the power of nostalgia." And everyone just said yes! It is a glorious fever dream. The story runs entirely on vibes and hero worship. Critics are struggling to find the logic, but that's on them. Brother, a ghost is piloting a human body to beat up cyber-criminals. If you are looking for realism, you walked into the wrong party. Just sit back and enjoy the chaos.`,
                cache_control: { type: 'ephemeral' },
            },
        ],

        // Messages array containing the user prompt with movie-specific data
        messages: [
            {
                role: 'user',
                // User prompt: Contains the actual movie data and output format specification
                // Template literals inject movie metadata and research content
                content: `Generate a PlotBurn roast for this movie.

**Movie:** ${facts.title} (${facts.release_date.split('-')[0]})
**Language:** ${facts.spoken_languages.find((l) => l.iso_639_1 === facts.original_language)?.english_name || facts.original_language}
**Genre:** ${facts.genres.length > 0 ? facts.genres.map((g) => g.name).join(', ') : 'film'}

**Plot Summary:**
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
   - Generate 4 movies with similar plots, themes, or vibes
   - REMEMBER: Mix Global and Regional if applicable
   - Format: ["Movie (Year) - similarity", ...]

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
        const jsonMatch =
            responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);

        // Use extracted JSON or fall back to raw response text
        const jsonString = jsonMatch ? jsonMatch[1] : responseText;

        // Parse and return the JSON response
        return JSON.parse(jsonString.trim());
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
