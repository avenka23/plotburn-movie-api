/**
 * Simple fixed-window rate limiter using KV
 * Uses a per-IP counter with a 60-second window
 */
export async function checkRateLimit(
	kv: KVNamespace,
	clientIP: string,
	maxRequests: number = 5,
	windowSeconds: number = 60
): Promise<{ allowed: boolean; remaining: number }> {
	const windowKey = Math.floor(Date.now() / (windowSeconds * 1000));
	const key = `rl:${clientIP}:${windowKey}`;

	const current = await kv.get(key);
	const count = current ? parseInt(current, 10) : 0;

	if (count >= maxRequests) {
		return { allowed: false, remaining: 0 };
	}

	await kv.put(key, (count + 1).toString(), { expirationTtl: windowSeconds * 2 });
	return { allowed: true, remaining: maxRequests - count - 1 };
}
