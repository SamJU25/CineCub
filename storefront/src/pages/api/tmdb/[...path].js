/**
 * Astro port of the former Cloudflare Pages Function (functions/api/tmdb/[[path]].js).
 *
 * Proxies /api/tmdb/* -> https://api.themoviedb.org/3/*
 * The TMDB API key is injected server-side from the Worker binding (TMDB_API_KEY),
 * so it is NEVER exposed to the client browser.
 *
 * SETUP (one-time): `wrangler secret put TMDB_API_KEY`
 * Dev uses storefront/.dev.vars via the adapter's platformProxy.
 */

export const prerender = false;

export const OPTIONS = async ({ request, url }) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': url.origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
};

export const GET = async ({ request, params, locals, url }) => {
  const runtime = locals.runtime ?? {};
  const env = runtime.env ?? {};

  // 1. Check Cloudflare Cache first to prevent API spam (guarded against environments without Cache API)
  const cache = runtime.caches?.default ?? (typeof caches !== 'undefined' ? caches.default : null);
  const cacheKey = new Request(request.url, request);
  const cachedResponse = cache ? await cache.match(cacheKey) : null;
  if (cachedResponse) {
    return cachedResponse;
  }

  // Reconstruct the TMDB path from the catch-all route segments
  const rawPath = params.path ?? '';
  const tmdbPath = '/' + (Array.isArray(rawPath) ? rawPath.join('/') : rawPath);

  // Get the query string from the original request and add the API key
  const queryParams = new URLSearchParams(url.search);

  // Inject the secret API key server-side
  const apiKey = env.TMDB_API_KEY || (typeof process !== 'undefined' && process.env?.TMDB_API_KEY) || (typeof import.meta !== 'undefined' && import.meta.env?.TMDB_API_KEY);
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
        'Accept': 'application/json'
      }
    });

    const data = await tmdbResponse.text();

    // Return the response with CORS and security headers
    const finalResponse = new Response(data, {
      status: tmdbResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': url.origin,
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff'
      }
    });

    // 2. Save the successful response to Cloudflare Cache
    if (tmdbResponse.ok && cache) {
      const waitUntil = runtime.waitUntil ?? ((p) => p);
      waitUntil(cache.put(cacheKey, finalResponse.clone()));
    }

    return finalResponse;
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy request failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
