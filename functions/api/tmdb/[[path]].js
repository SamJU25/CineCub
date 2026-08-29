/**
 * Cloudflare Pages Function — TMDB API Proxy
 * 
 * Proxies all requests to /api/tmdb/* → https://api.themoviedb.org/3/*
 * The TMDB API key is injected server-side from environment variables,
 * so it is NEVER exposed to the client browser.
 * 
 * SETUP: In your Cloudflare Pages dashboard, go to:
 *   Settings → Environment Variables → Add:
 *     Variable name:  TMDB_API_KEY
 *     Value:          <YOUR_TMDB_API_KEY>
 * 
 * Then remove the API key from script.js (it's already been removed).
 */

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);

  // Handle CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': url.origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // 1. Check Cloudflare Cache first to prevent API spam
  const cache = caches.default;
  // We only cache GET requests (which all of these are)
  const cacheKey = new Request(request.url, request);
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Reconstruct the TMDB path from the catch-all route segments
  const tmdbPath = '/' + (params.path || []).join('/');

  // Get the query string from the original request and add the API key
  const queryParams = new URLSearchParams(url.search);
  
  // Inject the secret API key server-side
  const apiKey = env.TMDB_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'TMDB API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  queryParams.set('api_key', apiKey);

  // Build the TMDB API URL
  const tmdbUrl = `https://api.themoviedb.org/3${tmdbPath}?${queryParams.toString()}`;

  try {
    // Forward the request to TMDB
    const tmdbResponse = await fetch(tmdbUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    const data = await tmdbResponse.text();

    // Return the response with CORS and security headers
    const finalResponse = new Response(data, {
      status: tmdbResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': url.origin,
        'Cache-Control': 'public, max-age=300',  // Cache for 5 minutes
        'X-Content-Type-Options': 'nosniff',
      }
    });

    // 2. Save the successful response to Cloudflare Cache
    if (tmdbResponse.ok) {
      context.waitUntil(cache.put(cacheKey, finalResponse.clone()));
    }

    return finalResponse;
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy request failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
