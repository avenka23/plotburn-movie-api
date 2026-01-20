import type { Env } from '../types';
import { getNowPlayingKey, getRoastPrefix, getTruthPrefix, getDebugPrefix } from '../constants';
import { json } from '../utils/response';

export async function handleClearNowPlayingCache(env: Env) {
	const deleted: string[] = [];
	const errors: string[] = [];

	const cacheKey = getNowPlayingKey(env);
	try {
		await env.NOW_PLAYING_KV.delete(cacheKey);
		deleted.push(cacheKey);
	} catch (err) {
		errors.push(`Failed to delete ${cacheKey}: ${err}`);
	}

	return json({
		success: errors.length === 0,
		deleted_count: deleted.length,
		deleted_keys: deleted,
		errors: errors.length > 0 ? errors : undefined,
		message: `Cleared NOW_PLAYING_KV cache`,
	});
}

export async function handleClearRoastCache(env: Env) {
	const deleted: string[] = [];
	const errors: string[] = [];

	const prefix = getRoastPrefix(env);
	const listResult = await env.ROAST_KV.list({ prefix });

	for (const key of listResult.keys) {
		try {
			await env.ROAST_KV.delete(key.name);
			deleted.push(key.name);
		} catch (err) {
			errors.push(`Failed to delete ${key.name}: ${err}`);
		}
	}

	return json({
		success: errors.length === 0,
		deleted_count: deleted.length,
		deleted_keys: deleted,
		errors: errors.length > 0 ? errors : undefined,
		message: `Cleared ${deleted.length} roast cache entries`,
	});
}

export async function handleClearTruthCache(env: Env) {
	const deleted: string[] = [];
	const errors: string[] = [];

	const prefix = getTruthPrefix(env);
	const listResult = await env.TRUTH_KV.list({ prefix });

	for (const key of listResult.keys) {
		try {
			await env.TRUTH_KV.delete(key.name);
			deleted.push(key.name);
		} catch (err) {
			errors.push(`Failed to delete ${key.name}: ${err}`);
		}
	}

	return json({
		success: errors.length === 0,
		deleted_count: deleted.length,
		deleted_keys: deleted,
		errors: errors.length > 0 ? errors : undefined,
		message: `Cleared ${deleted.length} truth cache entries`,
	});
}

export async function handleClearDebugCache(env: Env) {
	const deleted: string[] = [];
	const errors: string[] = [];

	const prefix = getDebugPrefix(env);
	const listResult = await env.DEBUG_KV.list({ prefix });

	for (const key of listResult.keys) {
		try {
			await env.DEBUG_KV.delete(key.name);
			deleted.push(key.name);
		} catch (err) {
			errors.push(`Failed to delete ${key.name}: ${err}`);
		}
	}

	return json({
		success: errors.length === 0,
		deleted_count: deleted.length,
		deleted_keys: deleted,
		errors: errors.length > 0 ? errors : undefined,
		message: `Cleared ${deleted.length} debug cache entries`,
	});
}

export async function handleClearAllCache(env: Env) {
	const deleted: string[] = [];
	const errors: string[] = [];

	// 1. Delete now-playing cache from NOW_PLAYING_KV
	const cacheKey = getNowPlayingKey(env);
	try {
		await env.NOW_PLAYING_KV.delete(cacheKey);
		deleted.push(cacheKey);
	} catch (err) {
		errors.push(`Failed to delete ${cacheKey}: ${err}`);
	}

	// 2. Get all roast keys from ROAST_KV and delete them
	const roastPrefix = getRoastPrefix(env);
	const roastList = await env.ROAST_KV.list({ prefix: roastPrefix });
	for (const key of roastList.keys) {
		try {
			await env.ROAST_KV.delete(key.name);
			deleted.push(key.name);
		} catch (err) {
			errors.push(`Failed to delete ${key.name}: ${err}`);
		}
	}

	// 3. Get all truth keys from TRUTH_KV and delete them
	const truthPrefix = getTruthPrefix(env);
	const truthList = await env.TRUTH_KV.list({ prefix: truthPrefix });
	for (const key of truthList.keys) {
		try {
			await env.TRUTH_KV.delete(key.name);
			deleted.push(key.name);
		} catch (err) {
			errors.push(`Failed to delete ${key.name}: ${err}`);
		}
	}

	// 4. Get all debug keys from DEBUG_KV and delete them
	const debugPrefix = getDebugPrefix(env);
	const debugList = await env.DEBUG_KV.list({ prefix: debugPrefix });
	for (const key of debugList.keys) {
		try {
			await env.DEBUG_KV.delete(key.name);
			deleted.push(key.name);
		} catch (err) {
			errors.push(`Failed to delete ${key.name}: ${err}`);
		}
	}

	return json({
		success: errors.length === 0,
		deleted_count: deleted.length,
		deleted_keys: deleted,
		errors: errors.length > 0 ? errors : undefined,
		message: `Cleared ${deleted.length} cache entries across all KV namespaces`,
	});
}
