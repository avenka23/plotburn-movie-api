import type { Env } from '../types';
import { getDebugPrefixByMovieId } from '../constants';
import { json } from '../utils/response';

export async function handleGetDebug(tmdbId: string, env: Env) {
	const prefix = getDebugPrefixByMovieId(env, tmdbId);

	// List all debug entries for this movie
	const list = await env.DEBUG_KV.list({ prefix });

	if (list.keys.length === 0) {
		return json({ error: 'No debug data found for this movie' }, 404);
	}

	// Fetch all debug payloads for this movie
	const debugEntries = await Promise.all(
		list.keys.map(async (key) => {
			const value = await env.DEBUG_KV.get(key.name);
			return {
				key: key.name,
				data: value ? JSON.parse(value) : null,
			};
		})
	);

	return json({
		movieId: tmdbId,
		count: debugEntries.length,
		entries: debugEntries,
	});
}

export async function handleGetDebugByCorrelation(correlationId: string, env: Env) {
	// Search across all debug entries for matching correlationId
	const prefix = `debug:${env.KV_VERSION}:movie:`;
	const list = await env.DEBUG_KV.list({ prefix });

	const matchingEntries = [];

	for (const key of list.keys) {
		if (key.name.endsWith(`:${correlationId}`)) {
			const value = await env.DEBUG_KV.get(key.name);
			if (value) {
				matchingEntries.push({
					key: key.name,
					data: JSON.parse(value),
				});
			}
		}
	}

	if (matchingEntries.length === 0) {
		return json({ error: 'No debug data found for this correlation ID' }, 404);
	}

	return json({
		correlationId,
		count: matchingEntries.length,
		entries: matchingEntries,
	});
}
