import type {
  Env,
  MovieTruth,
  MovieMeta,
  BraveSearchResponse,
  ExtractedMovieData,
} from '../types';
import { getTruthKey, getSearchKey, SEARCH_TTL, TRUTH_TTL } from '../constants';
import { Logger } from '../utils/logger';
import { getLanguageName } from "../utils/iso639";

// Stored search result type
interface StoredSearchResult {
  source: 'brave-search-api';
  fetchedAt: string;
  query: string;
  data: ExtractedMovieData;
  citations: string[];
}

// Grok extraction response type
interface GrokExtractionResponse {
  title: string;
  plot: {
    summary: string;
    absurdities: string[];
    genreConfusion: string;
  };
  characterArcs: {
    lead: string;
    supporting: string[];
    wastedPotential: string[];
  };
  reception: {
    criticalConsensus: string;
    audienceSentiment: string;
    split: string;
  };
  ratings: Array<{
    source: string;
    rating: string;
    criticName: string;
    quote: string;
    type: 'critic' | 'audience' | 'aggregate';
  }>;
  positives: string[];
  negatives: string[];
  memorableQuotes: Array<{
    type: 'positive' | 'negative' | 'absurd' | 'mixed';
    source: string;
    quote: string;
  }>;
  comparisons: Array<{
    comparedTo: string;
    reason: string;
    source: string;
  }>;
  controversy: {
    summary: string;
    details: string[];
    impact: string;
  };
  satiricalAngles: string[];
  boxOffice: {
    verdict: string;
    context: string;
  };
  miscs: {
    director: string;
    runtime: string;
    release: string;
    certificate: string;
    technicalNotes: string;
  };
}

const EXTRACTION_SYSTEM_PROMPT = `You are a precise movie review extraction assistant specializing in comprehensive reception analysis for satirical content generation. Your PRIMARY focus is extracting ALL reviews, ratings, and critic/audience reactions with MAXIMUM detail.

EXTRACTION PRIORITY (ALL EQUALLY IMPORTANT):
1. ALL RATINGS from every source (critics, platforms, audiences) - Extract EVERY rating mentioned
2. ALL REVIEWS with critic names and publications - Miss nothing
3. MEMORABLE QUOTES (positive, negative, absurd) - Get them all
4. CRITIC vs AUDIENCE sentiment split - Be specific
5. Plot absurdities and genre confusion - Concrete examples
6. Comparisons to other films - Who compared and why
7. Controversial elements - Full details
8. Box office context - Only if mentioned in reviews
9. Character arcs and wasted potential - Specifics
10. Satirical angles - Elements perfect for mockery

PLOT EXTRACTION RULES (ENHANCED):
- Provide DETAILED 4-6 sentence plot summary covering full narrative arc
- Extract EVERY absurd/illogical plot element mentioned in reviews
- Note specific plot holes, conveniences, or contrivances critics mentioned
- Include subplot details (romance, family drama, side characters)
- Extract pacing issues (slow first half, rushed climax, dragging second half)
- Note any historical inaccuracies or factual liberties mentioned
- Include turning points, twists, or major revelations referenced in reviews

RATINGS EXTRACTION RULES:
- Extract EVERY rating format: X/5, X/10, %, stars, letter grades
- Include ALL platforms: IMDb, Rotten Tomatoes, BookMyShow, Letterboxd, Metacritic, Google Reviews, JustWatch
- Include ALL publications: Times of India, Hindu, Indian Express, Rediff, OTT Play, Cinema Express, Firstpost, Scroll, News18, Film Companion
- Include ALL social media critics: Twitter/X handles, YouTube channels, Instagram reviewers
- Include critic names ALWAYS when available
- Look for keywords: 'rating', 'score', 'stars', 'rated', 'gave', 'verdict', 'marks'
- Separate professional critics from audience with 'type' field
- If multiple ratings from same source, include all
- Extract both numerical AND verbal verdicts ("Must Watch", "Skip", "Average")

REVIEW & QUOTE EXTRACTION (ENHANCED):
- Extract FULL review paragraphs when available, not just snippets
- Get specific criticisms: acting issues, dialogue problems, editing flaws, cinematography notes
- Extract EXACT praise: what worked, standout scenes, technical achievements
- Tag type: positive, negative, absurd, mixed, neutral
- ALWAYS attribute to specific source/critic with full name and platform
- Get EXACT quotes, never paraphrase
- If review has rating, include both
- Extract critic's overall recommendation (watch/skip/wait for OTT)
- Note review length indicators (short tweet vs detailed article)
- Include timestamp context (opening day reaction vs week later reassessment)

CHARACTER & PERFORMANCE EXTRACTION (ENHANCED):
- Extract specific acting critiques for each major actor
- Note chemistry issues between leads
- Identify scene-stealing performances
- Extract casting criticisms ("miscast", "wrong choice")
- Note underutilized actors with wasted potential
- Include physical transformation details if mentioned
- Extract dialogue delivery criticisms
- Note overacting or underacting mentions

COMPLETENESS:
- Extract from EVERY source provided
- Don't skip repetitive sources - track consensus
- Use 'N/A' only when truly missing
- Never fabricate data
- If same review appears in multiple sources, include all instances with attribution

RETURN STRUCTURE:
{
  "title": "Full movie title with year",
  "plot": {
    "detailedSummary": "4-6 sentence comprehensive plot covering setup, conflicts, turning points, and resolution",
    "subplots": ["Romance subplot details", "Family drama details", "Side character arcs"],
    "absurdities": ["Specific illogical elements with context"],
    "plotHoles": ["Specific plot holes mentioned by critics"],
    "pacingIssues": "Detailed pacing criticism from reviews",
    "genreConfusion": "How genres clash with examples"
  },
  "characterArcs": {
    "lead": "Detailed lead arc with transformation details",
    "supporting": ["Detailed supporting arcs with specific moments"],
    "wastedPotential": ["Underutilized actors with why they were wasted"],
    "castingIssues": ["Miscasting criticisms with alternatives suggested"]
  },
  "performances": {
    "praised": ["Actor name: what critics praised with specific scenes"],
    "criticized": ["Actor name: what critics criticized with examples"],
    "chemistry": "Lead chemistry analysis from reviews",
    "standouts": ["Scene-stealing performances"]
  },
  "reception": {
    "criticalConsensus": "Detailed critic sentiment with percentage if available and specific recurring themes",
    "audienceSentiment": "Detailed audience sentiment with patterns and common complaints/praises",
    "split": "Detailed critic vs audience disagreement with reasons why they differ",
    "verdictBreakdown": {
      "mustWatch": "Count or percentage",
      "average": "Count or percentage", 
      "skip": "Count or percentage"
    }
  },
  "ratings": [
    {
      "source": "Platform/Publication/Social Media",
      "rating": "X/Y or Verdict",
      "criticName": "Full name or Handle or N/A",
      "quote": "Full quote or paragraph or N/A",
      "type": "critic|audience|aggregate|social",
      "reviewLength": "tweet|short|medium|detailed",
      "timestamp": "Opening day/Week 1/etc or N/A"
    }
  ],
  "positives": ["Specific praised elements with who praised them"],
  "negatives": ["Specific criticized elements with who criticized them"],
  "technicalAspects": {
    "cinematography": "Detailed notes from reviews",
    "music": "Score and songs feedback with composer",
    "editing": "Editing critique",
    "direction": "Director's vision critique",
    "screenplay": "Writing quality analysis"
  },
  "memorableQuotes": [
    {
      "type": "positive|negative|absurd|mixed|technical",
      "source": "Full name (Publication/Platform) or Handle",
      "quote": "Exact quote - longer excerpts preferred",
      "context": "What aspect this quote addresses"
    }
  ],
  "comparisons": [
    {
      "comparedTo": "Film title",
      "reason": "Detailed reason with specifics",
      "source": "Who compared (with credentials)",
      "favorable": "yes|no|neutral"
    }
  ],
  "controversy": {
    "summary": "Detailed description with timeline",
    "details": ["Specific controversial elements with sources"],
    "publicReaction": "How audience/critics reacted to controversy",
    "impact": "Detailed effect on reception and box office"
  },
  "satiricalAngles": ["Detailed mockery elements with specific examples from reviews"],
  "boxOffice": {
    "verdict": "Hit/Average/Flop with context",
    "numbers": "Specific numbers if mentioned",
    "context": "Detailed context including budget, expectations, competition",
    "trajectory": "Opening vs sustained performance"
  },
  "socialMedia": {
    "twitterReactions": ["Notable tweets with handles"],
    "redditConsensus": "Subreddit reaction summary",
    "youtubeReviewers": ["Channel names and their verdicts"],
    "viralMoments": ["What went viral and why"]
  },
  "miscs": {
    "director": "Name (previous work with reception)",
    "runtime": "Duration with pacing notes from reviews",
    "release": "Date and detailed context",
    "certificate": "Rating with any controversy",
    "technicalNotes": "Comprehensive technical notes",
    "trivia": ["Interesting production details mentioned in reviews"]
  }
}

CRITICAL RULES:
- Prioritize COMPLETENESS over brevity
- Include EVERY review found, even if repetitive
- Extract FULL quotes when possible, not snippets
- Track WHO said WHAT about WHICH aspect
- Never summarize - extract verbatim
- If unsure about attribution, include with "Source uncertain"

Return only valid JSON without markdown.`;

/**
 * Fetches search results from Brave and stores in SEARCH_KV
 */
async function fetchBraveSearch(
  tmdbId: string,
  movieMeta: MovieMeta,
  env: Env,
  logger: Logger
): Promise<{ searchResult: StoredSearchResult; fromCache: boolean }> {
  const searchKey = getSearchKey(env, tmdbId);

  // Check SEARCH_KV cache
  const cachedSearch = await env.SEARCH_KV.get(searchKey, { type: 'json' });
  if (cachedSearch) {
    return { searchResult: cachedSearch as StoredSearchResult, fromCache: true };
  }

  // Prepare search query
  const lang = getLanguageName(movieMeta.original_language);
  const releaseYear = movieMeta.release_date?.split('-')[0] || new Date().getFullYear().toString();
  const searchQuery = `${movieMeta.title} ${releaseYear} ${lang} movie plot summary review rating audience verdict`;

  const apiStartTime = Date.now();

  // Call Brave Search API
  let res: Response;
  try {
    const searchParams = new URLSearchParams({
      q: searchQuery,
      extra_snippets: 'true',
      count: '20',
      country: 'IN',
      safesearch: 'off',
    });

    res = await fetch(`https://api.search.brave.com/res/v1/web/search?${searchParams}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': env.BRAVE_API_KEY,
      },
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    const duration = Date.now() - apiStartTime;
    await logger.logExternalAPICall(
      'Brave Search',
      { tmdbId, title: movieMeta?.title, query: searchQuery },
      undefined,
      (err as Error).message,
      duration
    );
    throw err;
  }

  const apiDuration = Date.now() - apiStartTime;

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '(no body)');
    await logger.logExternalAPICall(
      'Brave Search',
      { tmdbId, title: movieMeta?.title, query: searchQuery },
      undefined,
      `HTTP ${res.status} – ${errorBody}`,
      apiDuration
    );
    throw new Error(`Brave Search API error: ${res.status} – ${errorBody.slice(0, 300)}`);
  }

  // Parse response
  const data = (await res.json()) as BraveSearchResponse;

  // Extract relevant data
  const extractedData: ExtractedMovieData = {
    results: (data.web?.results || []).map((result) => ({
      title: result.title,
      description: result.description,
      extra_snippets: result.extra_snippets,
      rating: result.movie?.rating,
    })),
    faq: (data.faq?.results || []).map((faq) => ({
      question: faq.question,
      answer: faq.answer,
    })),
    infobox: data.infobox,
  };

  // Build stored search result
  const searchResult: StoredSearchResult = {
    source: 'brave-search-api',
    fetchedAt: new Date().toISOString(),
    query: searchQuery,
    data: extractedData,
    citations: data.web?.results?.map((r) => r.url) || [],
  };

  // Store in SEARCH_KV
  await env.SEARCH_KV.put(searchKey, JSON.stringify(searchResult), {
    expirationTtl: SEARCH_TTL,
  });

  // Log the API call
  await logger.logExternalAPICall(
    'Brave Search',
    { movieId: tmdbId, title: movieMeta.title, query: searchQuery },
    {
      results_count: data.web?.results?.length || 0,
      has_faq: !!data.faq,
      has_infobox: !!data.infobox,
      duration_ms: apiDuration,
    },
    undefined,
    apiDuration
  );

  return { searchResult, fromCache: false };
}

/**
 * Calls Grok API to extract structured movie data from search results
 */
async function extractWithGrok(
  searchResult: StoredSearchResult,
  movieMeta: MovieMeta,
  env: Env,
  logger: Logger
): Promise<{ extraction: GrokExtractionResponse; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const apiStartTime = Date.now();

  const body = {
    model: 'grok-4-1-fast-non-reasoning',
    temperature: 0.3,
    max_tokens: 10000,
    repetition_penalty: 1.05,
    top_p: 0.9,
    messages: [
      {
        role: 'system',
        content: EXTRACTION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `Extract movie information from this Brave Search response for "${movieMeta.title}" (${movieMeta.release_date?.split('-')[0] || 'Unknown Year'}):\n\n${JSON.stringify(searchResult.data, null, 2)}`,
      },
    ],
  };

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    const apiDuration = Date.now() - apiStartTime;

    if (!res.ok) {
      const errorText = await res.text();
      await logger.logExternalAPICall(
        'Grok (Extraction)',
        {
          movieId: movieMeta.id.toString(),
          movieTitle: movieMeta.title,
          model: body.model,
          stage: 'extraction',
        },
        undefined,
        `${res.status} ${res.statusText}: ${errorText}`,
        apiDuration
      );
      throw new Error(`Grok API failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    // Log successful API call
    await logger.logExternalAPICall(
      'Grok (Extraction)',
      {
        movieId: movieMeta.id.toString(),
        movieTitle: movieMeta.title,
        model: body.model,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        stage: 'extraction',
      },
      {
        response_length: data.choices[0]?.message?.content?.length || 0,
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
      },
      undefined,
      apiDuration
    );

    // Parse JSON response
    const responseText = data.choices[0]?.message?.content || '{}';

    // Handle potential markdown code blocks
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1] : responseText;

    const extraction = JSON.parse(jsonString.trim()) as GrokExtractionResponse;

    return {
      extraction,
      usage: {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    const apiDuration = Date.now() - apiStartTime;

    await logger.logExternalAPICall(
      'Grok (Extraction)',
      {
        movieId: movieMeta.id.toString(),
        movieTitle: movieMeta.title,
        model: body.model,
        stage: 'extraction',
      },
      undefined,
      error instanceof Error ? error.message : String(error),
      apiDuration
    );

    throw error;
  }
}

/**
 * Main function: Gets or creates movie truth
 * 1. Check TRUTH_KV cache
 * 2. Fetch/get Brave Search results (stored in SEARCH_KV)
 * 3. Call Grok to extract structured data
 * 4. Store extraction in TRUTH_KV
 */
export async function getOrCreateMovieTruth(
  tmdbId: string,
  movieMeta: MovieMeta,
  env: Env,
  correlationId: string
): Promise<MovieTruth> {
  const truthKey = getTruthKey(env, tmdbId);
  const logger = new Logger(env, '/api/movie-truth', 'GET', correlationId);

  // 1. Check TRUTH_KV cache
  const cachedTruth = await env.TRUTH_KV.get(truthKey, { type: 'json' });
  if (cachedTruth) {
    return cachedTruth as MovieTruth;
  }

  // 2. Fetch Brave Search results (stores in SEARCH_KV)
  const { searchResult } = await fetchBraveSearch(
    tmdbId,
    movieMeta,
    env,
    logger
  );

  // 3. Extract with Grok
  const { extraction, usage } = await extractWithGrok(
    searchResult,
    movieMeta,
    env,
    logger
  );

  // 4. Build MovieTruth object
  const truth: MovieTruth = {
    source: 'grok-extraction',
    fetchedAt: new Date().toISOString(),
    model: 'grok-4-1-fast-non-reasoning',
    costEstimateINR: 0, // Calculate based on usage if needed
    citations: searchResult.citations,
    content: JSON.stringify(extraction, null, 2),
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      tool_calls: 0,
      total_cost: 0,
    },
  };

  // 5. Store in TRUTH_KV
  await env.TRUTH_KV.put(truthKey, JSON.stringify(truth), {
    expirationTtl: TRUTH_TTL,
  });

  return truth;
}
