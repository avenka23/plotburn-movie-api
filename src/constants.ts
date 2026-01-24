import type { Env } from './types';

// Helper functions to build KV keys with version from env
export const getNowPlayingKey = (env: Env) => `now-playing:${env.KV_VERSION}`;
export const getRoastKey = (env: Env, tmdbId: string) => `roast:${env.KV_VERSION}:movie:${tmdbId}`;
export const getTruthKey = (env: Env, tmdbId: string) => `truth:${env.KV_VERSION}:movie:${tmdbId}`;
export const getSearchKey = (env: Env, tmdbId: string) => `search:${env.KV_VERSION}:movie:${tmdbId}`;
export const getRoastPrefix = (env: Env) => `roast:${env.KV_VERSION}:movie:`;
export const getTruthPrefix = (env: Env) => `truth:${env.KV_VERSION}:movie:`;
export const getSearchPrefix = (env: Env) => `search:${env.KV_VERSION}:movie:`;

// Debug payload key - searchable by movieId
export const getDebugKey = (env: Env, tmdbId: string, correlationId: string) =>
	`debug:${env.KV_VERSION}:movie:${tmdbId}:${correlationId}`;
export const getDebugPrefixByMovieId = (env: Env, tmdbId: string) => `debug:${env.KV_VERSION}:movie:${tmdbId}:`;
export const getDebugPrefix = (env: Env) => `debug:${env.KV_VERSION}:movie:`;

export const NOW_PLAYING_TTL = 23 * 60 * 60; // 23 hours
export const TOP_N = 5;
export const MIN_VOTES = 50;
export const ROAST_TTL = 60 * 60 * 24 * 180; // 180 days
export const SEARCH_TTL = 60 * 60 * 24 * 180; // 14 days
export const TRUTH_TTL = 60 * 60 * 24 * 180; // 14 days
export const DEBUG_TTL = 60 * 60 * 24 * 30; // 30 days (1 month)
export const USD_TO_INR = 85;

// Cron constants
export const CRON_HISTORY_LIMIT = 10; // Keep last 10 runs
export const CRON_DELAY_MS = 500; // 500ms delay between movie processing (rate limiting)
export const getCronLastRunKey = (env: Env) => `cron:last-run:${env.KV_VERSION}`;
export const getCronHistoryKey = (env: Env) => `cron:history:${env.KV_VERSION}`;
