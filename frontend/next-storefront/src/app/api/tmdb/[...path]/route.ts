import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";

const NOISE_PARAMS = new Set(["api_key", "_", "cb", "cache", "t", "timestamp", "ts", "now", "v"]);
const SAFE_PATH_RE = /^[A-Za-z0-9_./-]+$/;

const BUCKETS = new Map<string, { start: number; count: number }>();
const LIMIT_PER_WINDOW = 120;
const WINDOW_MS = 10 * 1000;

interface CacheRecord {
  data: string;
  status: number;
  ts: number;
}
const MEM_CACHE = new Map<string, CacheRecord>();
const CACHE_MAX_SIZE = 800;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes fresh
const STALE_TTL_MS = 60 * 60 * 1000; // 1 hour stale fallback

const INFLIGHT_REQUESTS = new Map<string, Promise<{ data: string; status: number }>>();

function clientIp(request: NextRequest): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown";
}

function rateLimited(request: NextRequest): boolean {
  const ip = clientIp(request);
  const now = Date.now();
  let bucket = BUCKETS.get(ip);
  if (!bucket || now - bucket.start > WINDOW_MS) {
    bucket = { start: now, count: 1 };
    BUCKETS.set(ip, bucket);
  } else {
    bucket.count++;
  }
  if (BUCKETS.size > 10000) {
    const cutoff = now - WINDOW_MS;
    for (const [k, b] of BUCKETS) if (now - b.start > cutoff) BUCKETS.delete(k);
  }
  const isLocal = ip === "unknown" || ip === "127.0.0.1" || ip === "::1";
  const limit = isLocal ? 400 : LIMIT_PER_WINDOW;
  return bucket.count > limit;
}

function canonicalParams(searchParams: URLSearchParams): URLSearchParams {
  const keys = [...searchParams.keys()].filter((k) => !NOISE_PARAMS.has(k)).sort();
  const out = new URLSearchParams();
  for (const k of keys) {
    const vals = [...searchParams.getAll(k)].sort();
    for (const v of vals) out.append(k, v);
  }
  return out;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("Origin") || "*";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const origin = request.headers.get("Origin") || "*";
  const { path } = await params;

  const rawPath = path ?? [];
  const sanitizedPath = (Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath))
    .replace(/\.\./g, "")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "");

  if (!SAFE_PATH_RE.test(sanitizedPath)) {
    return NextResponse.json({ error: "INVALID_PATH" }, {
      status: 400,
      headers: { "Access-Control-Allow-Origin": origin },
    });
  }

  const tmdbPath = "/" + sanitizedPath;
  const url = request.nextUrl;
  const canonicalQs = canonicalParams(url.searchParams);
  const cacheKey = `${tmdbPath}?${canonicalQs.toString()}`;

  // 1. Check in-memory fresh cache
  const cached = MEM_CACHE.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    // True O(1) LRU promotion: move accessed entry to the tail (MRU)
    MEM_CACHE.delete(cacheKey);
    MEM_CACHE.set(cacheKey, cached);
    return new NextResponse(cached.data, {
      status: cached.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "X-Cache": "HIT",
      },
    });
  }

  // 2. Check rate limit
  if (rateLimited(request)) {
    // If rate limited but stale cache exists, serve stale instead of 429
    if (cached && now - cached.ts < STALE_TTL_MS) {
      return new NextResponse(cached.data, {
        status: cached.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
          "X-Cache": "STALE_RATELIMIT",
        },
      });
    }
    return NextResponse.json({ error: "RATE_LIMITED" }, {
      status: 429,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Retry-After": "10",
      },
    });
  }

  // 3. Coalesce in-flight requests for the same TMDB path + params
  const existingInflight = INFLIGHT_REQUESTS.get(cacheKey);
  if (existingInflight) {
    try {
      const res = await existingInflight;
      return new NextResponse(res.data, {
        status: res.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
          "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          "X-Content-Type-Options": "nosniff",
          "X-Cache": "COALESCED",
        },
      });
    } catch {
      // Fall through to independent request if in-flight failed
    }
  }

  const bindings = await getCineCubBindings();
  const apiKey = (bindings.TMDB_API_KEY || process.env.TMDB_API_KEY || "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "TMDB API key not configured" }, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": origin },
    });
  }

  const queryParams = new URLSearchParams(url.search);
  queryParams.set("api_key", apiKey);
  const tmdbUrl = `https://api.themoviedb.org/3${tmdbPath}?${queryParams.toString()}`;

  const fetchPromise = (async (): Promise<{ data: string; status: number }> => {
    const RETRIES = 2;
    let tmdbResponse: Response | null = null;

    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
      try {
        tmdbResponse = await fetch(tmdbUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (tmdbResponse.ok || (tmdbResponse.status >= 400 && tmdbResponse.status < 500)) {
          break;
        }
      } catch (fetchErr) {
        if (attempt === RETRIES) throw fetchErr;
      }
    }

    if (!tmdbResponse) {
      throw new Error("Failed to contact upstream TMDB");
    }

    const data = await tmdbResponse.text();
    const result = { data, status: tmdbResponse.status };

    // Cache successful responses in memory (LRU order)
    if (tmdbResponse.ok) {
      MEM_CACHE.delete(cacheKey);
      MEM_CACHE.set(cacheKey, { data, status: tmdbResponse.status, ts: Date.now() });
      if (MEM_CACHE.size > CACHE_MAX_SIZE) {
        const oldestKey = MEM_CACHE.keys().next().value;
        if (oldestKey) MEM_CACHE.delete(oldestKey);
      }
    }

    return result;
  })();

  INFLIGHT_REQUESTS.set(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;
    return new NextResponse(result.data, {
      status: result.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "X-Cache": "MISS",
      },
    });
  } catch (err: unknown) {
    // If upstream failed or timed out, serve stale cache if available
    if (cached && Date.now() - cached.ts < STALE_TTL_MS) {
      return new NextResponse(cached.data, {
        status: cached.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
          "X-Cache": "STALE_FALLBACK",
        },
      });
    }

    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[tmdb-proxy] error:", err);
    return NextResponse.json(
      { error: "Proxy request failed", message: errorMessage },
      {
        status: 502,
        headers: { "Access-Control-Allow-Origin": origin },
      }
    );
  } finally {
    INFLIGHT_REQUESTS.delete(cacheKey);
  }
}
