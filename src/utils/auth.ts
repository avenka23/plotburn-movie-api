import type { Env } from '../types';
import { json } from './response';

/**
 * Validates the API secret key from the request headers
 * @param request - The incoming request
 * @param env - Environment variables containing API_SECRET_KEY
 * @returns Response with 401 if unauthorized, null if authorized
 */
export function validateApiKey(request: Request, env: Env): Response | null {
	const apiKey = request.headers.get('x-api-key');

	// Check if API_SECRET_KEY is configured
	if (!env.API_SECRET_KEY) {
		console.warn('API_SECRET_KEY is not configured - authentication disabled');
		return null; // Allow request if no key is configured (for development)
	}

	// Check if API key is provided
	if (!apiKey) {
		return json(
			{
				error: 'Unauthorized',
				message: 'Missing x-api-key header',
			},
			401
		);
	}

	// Validate API key
	if (apiKey !== env.API_SECRET_KEY) {
		return json(
			{
				error: 'Unauthorized',
				message: 'Invalid API key',
			},
			401
		);
	}

	// API key is valid
	return null;
}

/**
 * List of public endpoints that don't require authentication
 * Currently empty - all endpoints are protected
 */
export const PUBLIC_ENDPOINTS: string[] = [];

/**
 * Check if an endpoint is public (doesn't require authentication)
 * @param _pathname - The request pathname (unused - all endpoints are protected)
 * @returns true if the endpoint is public
 */
export function isPublicEndpoint(_pathname: string): boolean {
	// All endpoints require authentication
	return false;
}
