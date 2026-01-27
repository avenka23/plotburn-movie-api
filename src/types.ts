// ---------------- ENVIRONMENT ----------------

export interface Env {
	TMDB_API_KEY: string;
	XAI_API_KEY: string;
	BRAVE_API_KEY: string;
	CLAUDE_API_KEY: string;
	API_SECRET_KEY: string;
	R2: R2Bucket;
	plotburn_db: D1Database;
	RECENT_ROAST_KV: KVNamespace;
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

export type TMDBWatchProvider = {
	logo_path: string;
	provider_id: number;
	provider_name: string;
	display_priority: number;
};

export type TMDBWatchProvidersResponse = {
	id: number;
	results: {
		[countryCode: string]: {
			link: string;
			flatrate?: TMDBWatchProvider[];
			rent?: TMDBWatchProvider[];
			buy?: TMDBWatchProvider[];
		};
	};
};

export type StreamingProviderDB = {
	tmdb_movie_id: number;
	region: string;
	provider_id: number;
	provider_name: string;
	logo_path: string;
	type: string;
	link: string;
	last_updated: number;
};

// ---------------- MOVIE TRUTH STORAGE ----------------

export type MovieTruth = {
	source: string;
	fetchedAt: string;
	model: string;
	costEstimateINR: number;
	citations: string[];
	content: string;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens?: number;
		tool_calls?: number;
		total_cost: number;
	};
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
	overview: string;
	roast: string;
	reception: {
		bars: number;
		label: string;
	};
	chips: string[];
	similar_movies: string[];
	shareable_caption: string;
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
	status: 'in_progress' | 'success' | 'partial' | 'failed' | 'skipped';
	error?: string;
}

export interface CronHistoryEntry {
	id: number;
	job_name: string;
	started_at: number;
	finished_at: number | null;
	duration_ms: number | null;
	status: string;
	movies_roasted_count: number;
	movie_titles: string | null;
	cursor: string | null;
	error: string | null;
}

export interface CronHistory {
	job: string;
	runs: CronHistoryEntry[];
}

// ---------------- BRAVE SEARCH TYPES ----------------

export interface BraveSearchResponse {
	query: BraveQueryInfo;
	faq?: BraveFaqSection;
	mixed: BraveMixedResults;
	type: "search";
	web: BraveWebResults;
	infobox?: BraveInfoBox;
}

export interface BraveQueryInfo {
	original: string;
	show_strict_warning: boolean;
	cleaned: string;
	is_navigational: boolean;
	is_news_breaking: boolean;
	spellcheck_off: boolean;
	country: string;
	bad_results: boolean;
	should_fallback: boolean;
	postal_code: string;
	city: string;
	header_country: string;
	more_results_available: boolean;
	state: string;
	search_operators?: {
		applied: boolean;
		cleaned_query: string;
	};
}

export interface BraveFaqSection {
	type: "faq";
	results: BraveFaqItem[];
}

export interface BraveFaqItem {
	question: string;
	answer: string;
	title: string;
	url: string;
	meta_url: BraveMetaUrl;
}

export interface BraveMixedResults {
	type: "mixed";
	main: BraveMixedItem[];
	top: BraveMixedItem[];
	side: BraveMixedItem[];
}

export interface BraveMixedItem {
	type: "web" | "faq" | "news" | "videos" | "infobox";
	index?: number;
	all: boolean;
}

export interface BraveWebResults {
	type: "search";
	results: BraveSearchResult[];
	family_friendly: boolean;
}

export interface BraveSearchResult {
	title: string;
	url: string;
	is_source_local: boolean;
	is_source_both: boolean;
	description: string;
	page_age?: string;
	profile: BraveProfile;
	language: string;
	family_friendly: boolean;
	type: "search_result";
	subtype: "generic" | "movie" | "article" | "event" | "faq";
	is_live?: boolean;
	meta_url: BraveMetaUrl;
	thumbnail?: BraveThumbnail;
	age?: string;
	video?: BraveVideoData;
	movie?: BraveMovieSearchData;
	article?: BraveArticleData;
	faq?: BraveFaqData;
	review?: BraveReviewData;
	organization?: BraveOrganizationData;
	extra_snippets?: string[];
}

export interface BraveProfile {
	name: string;
	url: string;
	long_name: string;
	img: string;
}

export interface BraveMetaUrl {
	scheme: string;
	netloc: string;
	hostname: string;
	favicon: string;
	path: string;
}

export interface BraveThumbnail {
	src: string;
	original: string;
	logo: boolean;
}

export interface BraveVideoData {
	duration: string;
	thumbnail: BraveThumbnail;
}

export interface BraveMovieSearchData {
	name: string;
	description: string;
	url: string;
	thumbnail: BraveThumbnail;
	release: string;
	directors: BravePerson[];
	actors: BravePerson[];
	rating?: BraveRating;
	duration?: string;
	genre: string[];
}

export interface BravePerson {
	type: "person";
	name: string;
	url?: string;
	thumbnail?: BraveThumbnail;
}

export interface BraveRating {
	ratingValue: number;
	bestRating: number;
	reviewCount?: number;
	is_tripadvisor: boolean;
}

export interface BraveArticleData {
	author: BravePerson[];
	date: string;
	publisher: BravePublisher;
}

export interface BravePublisher {
	type: "organization";
	name: string;
	url?: string;
	thumbnail?: BraveThumbnail;
}

export interface BraveFaqData {
	items: BraveFaqItem[];
}

export interface BraveReviewData {
	type: "Review";
	name: string;
	thumbnail: BraveThumbnail;
	description: string;
	rating: BraveRating;
}

export interface BraveOrganizationData {
	type: "organization";
	name: string;
	contact_points: unknown[];
}

export interface BraveInfoBox {
	type: "infobox";
	position: number;
	label: string;
	category: string;
	long_desc: string;
	thumbnail: BraveThumbnail;
	attributes: Array<{
		label: string;
		value: string;
	}>;
	profiles: Array<{
		name: string;
		url: string;
		long_name: string;
		img: string;
	}>;
	website: {
		name: string;
		url: string;
	};
	ratings: Array<{
		name: string;
		score: number;
		scale: number;
	}>;
	providers: Array<{
		name: string;
		url: string;
	}>;
}

export interface ExtractedMovieData {
	results: Array<{
		title: string;
		description: string;
		extra_snippets?: string[];
		rating?: BraveRating;
	}>;
	faq: Array<{
		question: string;
		answer: string;
	}>;
	infobox?: BraveInfoBox;
}
