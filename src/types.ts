// ---------------- ENVIRONMENT ----------------

export interface Env {
	TMDB_API_KEY: string;
	XAI_API_KEY: string;
	PERPLEXITY_API_KEY: string;
	API_SECRET_KEY: string;
	NOW_PLAYING_KV: KVNamespace;
	ROAST_KV: KVNamespace;
	TRUTH_KV: KVNamespace;
	LOG_KV: KVNamespace;
	DEBUG_KV: KVNamespace;
	CRON_KV: KVNamespace;
	KV_VERSION: string;
	LOG_RETENTION_DAYS: number;
}

// ---------------- TMDB TYPES ----------------

export type TMDBNowPlayingResponse = {
	dates: { maximum: string; minimum: string };
	page: number;
	results: TMDBNowPlayingMovie[];
	total_pages: number;
	total_results: number;
};

export type TMDBNowPlayingMovie = {
	id: number;
	title: string;
	original_title: string;
	release_date: string;
	overview: string;
	popularity: number;
	poster_path: string | null;
	genre_ids: number[];
	vote_average: number;
	vote_count: number;
};

export type TMDBMovieDetails = {
	adult: boolean;
	backdrop_path: string | null;
	belongs_to_collection: unknown | null;
	budget: number;
	genres: { id: number; name: string }[];
	homepage: string;
	id: number;
	imdb_id: string | null;
	origin_country: string[];
	original_language: string;
	original_title: string;
	overview: string;
	popularity: number;
	poster_path: string | null;
	production_companies: {
		id: number;
		logo_path: string | null;
		name: string;
		origin_country: string;
	}[];
	production_countries: {
		iso_3166_1: string;
		name: string;
	}[];
	release_date: string;
	revenue: number;
	runtime: number;
	spoken_languages: {
		english_name: string;
		iso_639_1: string;
		name: string;
	}[];
	status: string;
	tagline: string;
	title: string;
	video: boolean;
	vote_average: number;
	vote_count: number;
};

// ---------------- TMDB CREDITS ----------------

export type TMDBCreditsResponse = {
	id: number;
	cast: {
		id: number;
		name: string;
		character: string;
		order: number;
	}[];
	crew: {
		id: number;
		name: string;
		job: string;
		department: string;
	}[];
};

// ---------------- MOVIE TRUTH STORAGE ----------------

export type MovieTruth = {
	source: string;
	fetchedAt: string;
	model: string;
	costEstimateINR: number;
	citations: string[];
	searchResults: {
		title: string;
		url: string;
		date: string;
		snippet: string;
	}[];
	content: string;
	raw: string;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		search_context_size: string;
		cost: {
			input_tokens_cost: number;
			output_tokens_cost: number;
			request_cost: number;
			total_cost: number;
		};
	};
};

export type PerplexityResponse = {
	id: string;
	model: string;
	created: number;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		search_context_size: string;
		cost: {
			input_tokens_cost: number;
			output_tokens_cost: number;
			request_cost: number;
			total_cost: number;
		};
	};
	citations: string[];
	search_results: {
		title: string;
		url: string;
		date: string;
		last_updated: string;
		snippet: string;
		source: string;
	}[];
	object: string;
	choices: {
		index: number;
		message: {
			role: string;
			content: string;
		};
		delta: {
			role: string;
			content: string;
		};
		finish_reason: string;
	}[];
};

// ---------------- MOVIE METADATA ----------------

export type MovieMeta = {
	adult: boolean;
	backdrop_path: string | null;
	belongs_to_collection: unknown | null;
	budget: number;
	genres: { id: number; name: string }[];
	homepage: string;
	id: number;
	imdb_id: string | null;
	origin_country: string[];
	original_language: string;
	original_title: string;
	overview: string;
	popularity: number;
	poster_path: string | null;
	production_companies: {
		id: number;
		logo_path: string | null;
		name: string;
		origin_country: string;
	}[];
	production_countries: {
		iso_3166_1: string;
		name: string;
	}[];
	release_date: string;
	revenue: number;
	runtime: number;
	spoken_languages: {
		english_name: string;
		iso_639_1: string;
		name: string;
	}[];
	status: string;
	tagline: string;
	title: string;
	video: boolean;
	vote_average: number;
	vote_count: number;
};

// ---------------- GROK TYPES ----------------

export type GrokResponse = {
	choices: { message: { content: string } }[];
};

// ---------------- NOW PLAYING RESPONSE TYPES ----------------

export interface NowPlayingMovie {
	id: number;
	title: string;
	release_date: string;
	rating: number;
	votes: number;
	popularity: number;
	overview: string;
	poster_url: string | null;
	has_roast: boolean;
}

export interface NowPlayingResponse {
	cached: boolean;
	page: number;
	total_pages: number;
	total_results: number;
	dates: { maximum: string; minimum: string };
	movies: NowPlayingMovie[];
}

// ---------------- MOVIE ROAST RESPONSE TYPES ----------------

export interface MovieRoast {
	headline: string;
	content: string;
	chips: string[];
	internet_vibe: string[];
	your_opinion: string;
	similar_movies: string[];
}

export interface MovieRoastResponse {
	cached: boolean;
	movie: MovieMeta;
	roast: MovieRoast;
	generated_at: string;
	disclaimer: string;
	truth_source: string;
	truth_fetched_at: string;
}

// ---------------- CRON TYPES ----------------

export interface CronResult {
	timestamp: string;
	trigger: 'scheduled' | 'manual';
	correlation_id: string;
	movies_fetched?: number;
	roasts_processed?: number;
	roasts_cached?: number;
	roasts_generated?: number;
	roasts_failed?: number;
	failed_movie_ids?: number[];
	duration_ms?: number;
	status: 'in_progress' | 'success' | 'partial' | 'failed';
}

export interface CronHistory {
	runs: CronResult[];
	last_updated: string;
}
