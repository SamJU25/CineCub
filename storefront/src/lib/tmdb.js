// StreamHeaven storefront — TMDB data layer
// Server-side only: the API key never reaches the browser.
// All responses are cached at the Cloudflare edge (5 min) to protect TMDB quota at scale.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

export const IMG = {
  poster: (path, size = 'w500') => (path ? `${IMG_BASE}/${size}${path}` : null),
  backdrop: (path, size = 'w1280') => (path ? `${IMG_BASE}/${size}${path}` : null),
  profile: (path) => (path ? `${IMG_BASE}/w185${path}` : null)
};

/** Convert "Dune: Part Two" → "dune-part-two" (URL-safe) */
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Canonical URL slug for a TMDB item: "<id>-<title-slug>" */
export function buildSlug(item) {
  const title = item.title || item.name || '';
  const slug = slugify(title);
  return slug ? `${item.id}-${slug}` : `${item.id}`;
}

/** Extract the numeric TMDB id from a slug like "693134-dune-part-two" */
export function parseSlug(slug) {
  const id = parseInt(String(slug || ''), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Cached TMDB GET request.
 * @param {string} path   e.g. "/movie/693134"
 * @param {object} params extra query params (append_to_response, page, ...)
 * @param {object} env    Worker env (needs TMDB_API_KEY)
 * @returns {Promise<object|null>}
 */
export async function tmdb(path, params, env) {
  const apiKey = (env && env.TMDB_API_KEY) || (typeof process !== 'undefined' && process.env?.TMDB_API_KEY) || (typeof import.meta !== 'undefined' && import.meta.env?.TMDB_API_KEY);
  if (!apiKey) {
    console.error('[tmdb] TMDB_API_KEY is not configured');
    return null;
  }

  const url = new URL(TMDB_BASE + path);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  url.searchParams.set('api_key', apiKey);

  // Edge cache: identical TMDB lookups across users hit the cache, not TMDB
  try {
    if (typeof caches !== 'undefined' && caches.default) {
      const cacheKey = new Request(url, { method: 'GET' });
      const cached = await caches.default.match(cacheKey);
      if (cached) return cached.json();

      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) {
        console.error(`[tmdb] ${path} responded ${res.status}`);
        return null;
      }
      const data = await res.json();
      const cacheRes = new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
        }
      });
      await caches.default.put(cacheKey, cacheRes);
      return data;
    }
  } catch (err) {
    console.error('[tmdb] cache error, falling back to direct fetch:', err.message);
  }

  // Fallback (e.g. certain dev contexts without Cache API)
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[tmdb] fetch failed:', err.message);
    return null;
  }
}

/** Movie detail + credits + recommendations */
export function getMovie(id, env) {
  return tmdb(`/movie/${id}`, { append_to_response: 'credits,recommendations' }, env);
}

/** TV series detail + credits + recommendations */
export function getSeries(id, env) {
  return tmdb(`/tv/${id}`, { append_to_response: 'credits,recommendations' }, env);
}

/** Trending titles (movie + tv mixed) */
export function getTrending(env, page = 1) {
  return tmdb('/trending/all/week', { page }, env);
}

/** Popular movies / tv — type: "movie" | "tv" */
export function getPopular(type, env, page = 1) {
  return tmdb(`/${type}/popular`, { page }, env);
}

/** Format runtime minutes → "2h 46m" */
export function formatRuntime(mins) {
  if (!mins || mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Year from a date string */
export function year(dateStr) {
  return dateStr ? String(dateStr).slice(0, 4) : '';
}
