import { CFG, IMG } from "./config";
import type {
  MediaItem,
  MediaDetail,
  PersonDetail,
  CollectionDetail,
  Episode,
  Video,
  TMDBResponse,
  StreamResponse,
  CastMember,
  TorrentSource,
} from "./types";
export { IMG };

const cache = new Map<string, { data: unknown; ts: number }>();
const inflight = new Map<string, Promise<unknown>>();
const CACHE_TTL = 5 * 60 * 1000;

function combineSignals(s1?: AbortSignal, s2?: AbortSignal): AbortSignal | undefined {
  if (!s1) return s2;
  if (!s2) return s1;
  const signalWithAny = AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal };
  if (typeof signalWithAny.any === "function") {
    try {
      return signalWithAny.any([s1, s2]);
    } catch {}
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (s1.aborted || s2.aborted) {
    controller.abort();
    return controller.signal;
  }
  s1.addEventListener("abort", onAbort, { once: true });
  s2.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

function getTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    try {
      return AbortSignal.timeout(ms);
    } catch {}
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function fetchJSON<T = unknown>(
  url: string,
  retries = 2,
  backoff = 350,
  signal?: AbortSignal,
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) return null;
    try {
      const timeoutSignal = getTimeoutSignal(9000);
      const combinedSignal = combineSignals(signal, timeoutSignal);
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: combinedSignal });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, backoff * (attempt + 1)));
          continue;
        }
      }
      return null;
    } catch (err) {
      if (signal?.aborted) return null;
      if (attempt < retries) await new Promise((r) => setTimeout(r, backoff * (attempt + 1)));
      else return null;
    }
  }
  return null;
}

export async function apiFetch<T = TMDBResponse>(
  endpoint: string,
  params: Record<string, string | number> = {},
  signal?: AbortSignal,
): Promise<T | null> {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const url = new URL(endpoint, origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const key = url.toString();
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_TTL) {
    // True O(1) LRU promotion: move accessed entry to the tail (MRU)
    cache.delete(key);
    cache.set(key, cached);
    const d = cached.data as Record<string, unknown> | null;
    if (d && Array.isArray(d.results)) {
      return { ...d, results: [...d.results] } as T;
    }
    return cached.data as T;
  }

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T | null>;

  const promise = fetchJSON<T>(key, 2, 350, signal)
    .then((data) => {
      if (data) {
        // Maintain LRU order by appending to tail
        cache.delete(key);
        cache.set(key, { data, ts: Date.now() });
        if (cache.size > 200) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }
      }
      return data;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

export async function tmdbFetch<T = TMDBResponse>(
  path: string,
  params: Record<string, string | number> = {},
  signal?: AbortSignal,
): Promise<T | null> {
  return apiFetch<T>(`${CFG.BASE}${path}`, params, signal);
}

export async function prefetchDetail(id: number, type: string): Promise<void> {
  if (type === "person") {
    getPerson(id).catch(() => {});
    return;
  }
  const normType = type === "anime" ? "tv" : (type || "movie");
  const fullUrl = `${CFG.BASE}/${normType}/${id}?append_to_response=credits,videos,similar,recommendations,keywords,external_ids`;
  const cached = cache.get(fullUrl);
  if (!cached || Date.now() - cached.ts > CACHE_TTL) {
    getDetail(id, normType).catch(() => {});
  }
}

export async function getDetail<T = MediaDetail>(id: number, type: string): Promise<T | null> {
  if (type === "person") {
    return (await getPerson(id)) as T | null;
  }
  const normType = type === "anime" ? "tv" : (type || "movie");
  const fullUrl = `${CFG.BASE}/${normType}/${id}?append_to_response=credits,videos,similar,recommendations,keywords,external_ids`;
  const cached = cache.get(fullUrl);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data as T;

  // 1. Primary request with rich metadata (credits, trailers, recommendations)
  let data = await fetchJSON<T>(fullUrl);

  // 2. Resilient type fallback: if "movie" returned 404/null, auto-retry as "tv", and vice versa
  if (!data && (normType === "movie" || normType === "tv")) {
    const altType = normType === "movie" ? "tv" : "movie";
    const altUrl = `${CFG.BASE}/${altType}/${id}?append_to_response=credits,videos,similar,recommendations,keywords,external_ids`;
    const altCached = cache.get(altUrl);
    if (altCached && Date.now() - altCached.ts < CACHE_TTL) return altCached.data as T;
    data = await fetchJSON<T>(altUrl);
    if (data) {
      cache.set(altUrl, { data, ts: Date.now() });
      cache.set(fullUrl, { data, ts: Date.now() });
      return data;
    }
  }

  // 3. Fallback to lean query (credits & videos only) if upstream TMDB 500s or times out on heavy payload
  if (!data) {
    const leanUrl = `${CFG.BASE}/${normType}/${id}?append_to_response=credits,videos`;
    data = await fetchJSON<T>(leanUrl);
    if (!data && (normType === "movie" || normType === "tv")) {
      const altType = normType === "movie" ? "tv" : "movie";
      const altLeanUrl = `${CFG.BASE}/${altType}/${id}?append_to_response=credits,videos`;
      data = await fetchJSON<T>(altLeanUrl);
    }
  }

  if (data) cache.set(fullUrl, { data, ts: Date.now() });
  return data;
}

export async function getStreams(_id: number, _type: string, _season?: number, _episode?: number): Promise<StreamResponse> {
  void _id; void _type; void _season; void _episode;
  // Direct stream scrapers on Render are offline (Render service deleted).
  // Return empty immediately so the player switches to Cloud Stream with 0ms delay.
  return { streams: [] };
}

export async function searchTMDB(query: string, page = 1, signal?: AbortSignal): Promise<TMDBResponse | null> {
  return tmdbFetch<TMDBResponse>("/search/multi", { query, page, include_adult: "false" }, signal);
}

export async function getTrending(type = "all", timeWindow = "day", page = 1, signal?: AbortSignal): Promise<TMDBResponse | null> {
  return tmdbFetch<TMDBResponse>(`/trending/${type}/${timeWindow}`, { page }, signal);
}

export async function getPopular(type: "movie" | "tv" = "movie", page = 1, signal?: AbortSignal): Promise<TMDBResponse | null> {
  return tmdbFetch<TMDBResponse>(`/${type}/popular`, { page }, signal);
}

export async function getTopRated(type: "movie" | "tv" = "movie", page = 1, signal?: AbortSignal): Promise<TMDBResponse | null> {
  return tmdbFetch<TMDBResponse>("/discover/" + type, { sort_by: "vote_average.desc", "vote_count.gte": 200, page }, signal);
}

export async function getUpcoming(page = 1, signal?: AbortSignal): Promise<TMDBResponse | null> {
  return tmdbFetch<TMDBResponse>("/movie/upcoming", { page }, signal);
}

export async function getAnime(page = 1, signal?: AbortSignal): Promise<TMDBResponse | null> {
  return tmdbFetch<TMDBResponse>("/discover/tv", { with_genres: "16", with_original_language: "ja", sort_by: "popularity.desc", page }, signal);
}

export async function getMoviesByGenre(genreId: number, page = 1, signal?: AbortSignal): Promise<TMDBResponse | null> {
  return tmdbFetch<TMDBResponse>("/discover/movie", { with_genres: genreId, sort_by: "popularity.desc", page }, signal);
}

export async function getTVByGenre(genreId: number, page = 1, signal?: AbortSignal): Promise<TMDBResponse | null> {
  const tvGenre = CFG.TV_GENRE_REMAP[genreId] || genreId;
  return tmdbFetch<TMDBResponse>("/discover/tv", { with_genres: tvGenre, sort_by: "popularity.desc", page }, signal);
}

export async function getAnimeByGenre(genreId: number, page = 1, signal?: AbortSignal): Promise<TMDBResponse | null> {
  const tvGenre = CFG.TV_GENRE_REMAP[genreId] || genreId;
  return tmdbFetch<TMDBResponse>("/discover/tv", { with_genres: `${tvGenre},16`, with_original_language: "ja", sort_by: "popularity.desc", page }, signal);
}

export async function getSeasonEpisodes(tvId: number, season: number): Promise<{ episodes: Episode[] } | null> {
  return tmdbFetch<{ episodes: Episode[] }>(`/tv/${tvId}/season/${season}`);
}

export async function getPerson(id: number): Promise<PersonDetail | null> {
  return tmdbFetch<PersonDetail>(`/person/${id}`, { append_to_response: "combined_credits,external_ids" });
}

export async function getCollection(id: number): Promise<CollectionDetail | null> {
  return tmdbFetch<CollectionDetail>(`/collection/${id}`);
}

export async function getMovieRecommendations(id: number): Promise<TMDBResponse | null> {
  return tmdbFetch<TMDBResponse>(`/movie/${id}/recommendations`);
}

export async function getTVRecommendations(id: number): Promise<TMDBResponse | null> {
  return tmdbFetch<TMDBResponse>(`/tv/${id}/recommendations`);
}

export async function getMovieSimilar(id: number): Promise<TMDBResponse | null> {
  return tmdbFetch<TMDBResponse>(`/movie/${id}/similar`);
}

export async function getTVSimilar(id: number): Promise<TMDBResponse | null> {
  return tmdbFetch<TMDBResponse>(`/tv/${id}/similar`);
}

export async function getMovieCredits(id: number): Promise<{ id: number; cast: CastMember[] } | null> {
  return tmdbFetch<{ id: number; cast: CastMember[] }>(`/movie/${id}/credits`);
}

export async function getTVCredits(id: number): Promise<{ id: number; cast: CastMember[] } | null> {
  return tmdbFetch<{ id: number; cast: CastMember[] }>(`/tv/${id}/credits`);
}

export async function getMovieVideos(id: number): Promise<{ id: number; results: Video[] } | null> {
  return tmdbFetch<{ id: number; results: Video[] }>(`/movie/${id}/videos`);
}

export async function getTVVideos(id: number): Promise<{ id: number; results: Video[] } | null> {
  return tmdbFetch<{ id: number; results: Video[] }>(`/tv/${id}/videos`);
}

async function fetchBatch(
  fetcher: (p: number) => Promise<TMDBResponse | null>,
  batchPage: number,
): Promise<TMDBResponse | null> {
  const p1 = batchPage * 2 - 1;
  const p2 = batchPage * 2;
  const [res1, res2] = await Promise.all([fetcher(p1), fetcher(p2)]);
  if (!res1 && !res2) return null;
  const r1 = (res1?.results || []).filter((x) => x && x.poster_path && x.media_type !== "person");
  const r2 = (res2?.results || []).filter((x) => x && x.poster_path && x.media_type !== "person");
  const combined = [...r1, ...r2];
  const maxTotalPages = Math.max(res1?.total_pages || 1, res2?.total_pages || 1);
  return {
    page: batchPage,
    total_pages: Math.min(250, maxTotalPages),
    results: combined,
    total_results: (res1?.total_results || 0) + (res2?.total_results || 0),
  };
}

export async function fetchBrowse(
  category: string,
  mediaType: "all" | "movie" | "tv" | "anime" = "all",
  sort: string = "popular",
  genreId: number | null = null,
  trendingTime: string = "day",
  page = 1,
  signal?: AbortSignal,
): Promise<TMDBResponse | null> {
  const genre = genreId ? String(genreId) : undefined;
  const tvGenre = genreId ? String(CFG.TV_GENRE_REMAP[genreId] || genreId) : undefined;

  // 1. STANDARD ANIME CATEGORY (Dual parallel batch: 40 titles per load like Top Rated)
  if (category === "anime") {
    const genreParam = tvGenre ? `16,${tvGenre}` : "16";
    const sortParam =
      sort === "toprated"
        ? "vote_average.desc"
        : sort === "newest"
        ? "first_air_date.desc"
        : "popularity.desc";
    const today = new Date().toISOString().slice(0, 10);
    const extraParams: Record<string, string | number> = {};
    if (sort === "toprated") extraParams["vote_count.gte"] = 200;
    else if (sort === "newest") {
      extraParams["first_air_date.lte"] = today;
      extraParams["vote_count.gte"] = 1;
    } else {
      extraParams["first_air_date.lte"] = today;
      extraParams["vote_count.gte"] = 1;
    }
    const res = await fetchBatch(
      (p) =>
        tmdbFetch<TMDBResponse>(
          "/discover/tv",
          {
            page: p,
            with_genres: genreParam,
            with_original_language: "ja",
            sort_by: sortParam,
            ...extraParams,
          },
          signal,
        ),
      page,
    );
    if (res?.results) {
      return {
        ...res,
        results: res.results.map((r) => ({ ...r, media_type: "tv" })),
      };
    }
    return res;
  }

  // 2. STANDARD MOVIE CATEGORY (Dual parallel batch: 40 titles per load like Top Rated)
  if (category === "movie") {
    const today = new Date().toISOString().slice(0, 10);
    const fetchMoviePage = (p: number) => {
      if (genre) {
        const sortParam =
          sort === "toprated"
            ? "vote_average.desc"
            : sort === "newest"
            ? "primary_release_date.desc"
            : "popularity.desc";
        const params: Record<string, string | number> = {
          page: p,
          with_genres: genre,
          sort_by: sortParam,
        };
        if (sort === "toprated") params["vote_count.gte"] = 150;
        if (sort === "newest") {
          params["primary_release_date.lte"] = today;
          params["vote_count.gte"] = 1;
        }
        return tmdbFetch<TMDBResponse>("/discover/movie", params, signal);
      }
      if (sort === "trending") return getTrending("movie", trendingTime || "day", p, signal);
      if (sort === "toprated") return getTopRated("movie", p, signal);
      if (sort === "newest") {
        return tmdbFetch<TMDBResponse>(
          "/discover/movie",
          {
            page: p,
            sort_by: "primary_release_date.desc",
            "primary_release_date.lte": today,
            "vote_count.gte": 1,
          },
          signal,
        );
      }
      if (sort === "upcoming") return getUpcoming(p, signal);
      return tmdbFetch<TMDBResponse>(
        "/discover/movie",
        {
          page: p,
          sort_by: "popularity.desc",
          "primary_release_date.lte": today,
          "vote_count.gte": 5,
        },
        signal,
      );
    };

    const res = await fetchBatch(fetchMoviePage, page);
    if (res?.results) {
      return {
        ...res,
        results: res.results.map((r) => ({ ...r, media_type: "movie" })),
      };
    }
    return res;
  }

  // 3. STANDARD TV CATEGORY (Dual parallel batch: 40 titles per load like Top Rated)
  if (category === "tv") {
    const today = new Date().toISOString().slice(0, 10);
    const fetchTvPage = (p: number) => {
      if (tvGenre) {
        const sortParam =
          sort === "toprated"
            ? "vote_average.desc"
            : sort === "newest"
            ? "first_air_date.desc"
            : "popularity.desc";
        const params: Record<string, string | number> = {
          page: p,
          with_genres: tvGenre,
          sort_by: sortParam,
        };
        if (sort === "toprated") params["vote_count.gte"] = 150;
        if (sort === "newest") {
          params["first_air_date.lte"] = today;
          params["vote_count.gte"] = 1;
        }
        return tmdbFetch<TMDBResponse>("/discover/tv", params, signal);
      }
      if (sort === "trending") return getTrending("tv", trendingTime || "day", p, signal);
      if (sort === "toprated") return getTopRated("tv", p, signal);
      if (sort === "newest" || sort === "upcoming") {
        return tmdbFetch<TMDBResponse>(
          "/discover/tv",
          {
            page: p,
            sort_by: "first_air_date.desc",
            "first_air_date.lte": today,
            "vote_count.gte": 1,
          },
          signal,
        );
      }
      return tmdbFetch<TMDBResponse>(
        "/discover/tv",
        {
          page: p,
          sort_by: "popularity.desc",
          "first_air_date.lte": today,
          "vote_count.gte": 5,
        },
        signal,
      );
    };

    const res = await fetchBatch(fetchTvPage, page);
    if (res?.results) {
      return {
        ...res,
        results: res.results.map((r) => ({ ...r, media_type: "tv" })),
      };
    }
    return res;
  }

  // 4. EXPLORE CATEGORIES: trending, popular, toprated, upcoming
  const cat = ["trending", "popular", "toprated", "upcoming"].includes(category) ? category : "popular";

  // If mediaType is "anime"
  if (mediaType === "anime") {
    const animeGenre = tvGenre ? `16,${tvGenre}` : "16";
    let sortParam = "popularity.desc";
    const extraParams: Record<string, string | number> = {};
    if (cat === "toprated") {
      sortParam = "vote_average.desc";
      extraParams["vote_count.gte"] = 200;
    } else if (cat === "upcoming") {
      sortParam = "first_air_date.desc";
      extraParams["first_air_date.lte"] = new Date().toISOString().slice(0, 10);
      extraParams["vote_count.gte"] = 1;
    }
    const res = await fetchBatch(
      (p) =>
        tmdbFetch<TMDBResponse>(
          "/discover/tv",
          {
            page: p,
            with_genres: animeGenre,
            with_original_language: "ja",
            sort_by: sortParam,
            ...extraParams,
          },
          signal,
        ),
      page,
    );
    if (res?.results) {
      return {
        ...res,
        results: res.results.map((r) => ({ ...r, media_type: "tv" })),
      };
    }
    return res;
  }

  // If mediaType is "movie"
  if (mediaType === "movie") {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetchBatch((p) => {
      if (cat === "trending") {
        if (genre) return tmdbFetch<TMDBResponse>("/discover/movie", { page: p, sort_by: "popularity.desc", with_genres: genre }, signal);
        return getTrending("movie", trendingTime || "day", p, signal);
      }
      if (cat === "toprated") {
        if (genre) return tmdbFetch<TMDBResponse>("/discover/movie", { page: p, sort_by: "vote_average.desc", "vote_count.gte": 150, with_genres: genre }, signal);
        return getTopRated("movie", p, signal);
      }
      if (cat === "upcoming") {
        if (genre) return tmdbFetch<TMDBResponse>("/discover/movie", { page: p, sort_by: "primary_release_date.desc", "primary_release_date.lte": today, "vote_count.gte": 1, with_genres: genre }, signal);
        return getUpcoming(p, signal);
      }
      if (genre) return tmdbFetch<TMDBResponse>("/discover/movie", { page: p, sort_by: "popularity.desc", with_genres: genre }, signal);
      return tmdbFetch<TMDBResponse>("/discover/movie", { page: p, sort_by: "popularity.desc", "primary_release_date.lte": today, "vote_count.gte": 5 }, signal);
    }, page);
    if (res?.results) {
      return {
        ...res,
        results: res.results.map((r) => ({ ...r, media_type: "movie" })),
      };
    }
    return res;
  }

  // If mediaType is "tv"
  if (mediaType === "tv") {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetchBatch((p) => {
      if (cat === "trending") {
        if (tvGenre) return tmdbFetch<TMDBResponse>("/discover/tv", { page: p, sort_by: "popularity.desc", with_genres: tvGenre }, signal);
        return getTrending("tv", trendingTime || "day", p, signal);
      }
      if (cat === "toprated") {
        if (tvGenre) return tmdbFetch<TMDBResponse>("/discover/tv", { page: p, sort_by: "vote_average.desc", "vote_count.gte": 150, with_genres: tvGenre }, signal);
        return getTopRated("tv", p, signal);
      }
      if (cat === "upcoming") {
        if (tvGenre) return tmdbFetch<TMDBResponse>("/discover/tv", { page: p, sort_by: "first_air_date.desc", with_genres: tvGenre }, signal);
        return tmdbFetch<TMDBResponse>("/discover/tv", { page: p, sort_by: "first_air_date.desc", "first_air_date.lte": today, "vote_count.gte": 1 }, signal);
      }
      if (tvGenre) return tmdbFetch<TMDBResponse>("/discover/tv", { page: p, sort_by: "popularity.desc", with_genres: tvGenre }, signal);
      return tmdbFetch<TMDBResponse>("/discover/tv", { page: p, sort_by: "popularity.desc", "first_air_date.lte": today, "vote_count.gte": 5 }, signal);
    }, page);
    if (res?.results) {
      return {
        ...res,
        results: res.results.map((r) => ({ ...r, media_type: "tv" })),
      };
    }
    return res;
  }

  // mediaType === "all" (interleaved movie & tv)
  if (cat === "trending") {
    if (genre) {
      return Promise.all([
        tmdbFetch<TMDBResponse>("/discover/movie", { page, sort_by: "popularity.desc", with_genres: genre }, signal),
        tmdbFetch<TMDBResponse>("/discover/tv", { page, sort_by: "popularity.desc", with_genres: tvGenre || genre }, signal),
      ]).then(([m, t]) => interleave(m, t, page));
    }
    const res = await getTrending("all", trendingTime || "day", page, signal);
    if (res?.results) {
      return {
        ...res,
        results: res.results.filter((r) => r && r.poster_path && r.media_type !== "person"),
      };
    }
    return res;
  }

  if (cat === "toprated") {
    if (genre) {
      return Promise.all([
        tmdbFetch<TMDBResponse>("/discover/movie", { page, sort_by: "vote_average.desc", "vote_count.gte": 150, with_genres: genre }, signal),
        tmdbFetch<TMDBResponse>("/discover/tv", { page, sort_by: "vote_average.desc", "vote_count.gte": 150, with_genres: tvGenre || genre }, signal),
      ]).then(([m, t]) => interleave(m, t, page));
    }
    return Promise.all([
      getTopRated("movie", page, signal),
      getTopRated("tv", page, signal),
    ]).then(([m, t]) => interleave(m, t, page));
  }

  if (cat === "upcoming") {
    if (genre) {
      return Promise.all([
        tmdbFetch<TMDBResponse>("/discover/movie", { page, sort_by: "primary_release_date.desc", with_genres: genre }, signal),
        tmdbFetch<TMDBResponse>("/discover/tv", { page, sort_by: "first_air_date.desc", with_genres: tvGenre || genre }, signal),
      ]).then(([m, t]) => interleave(m, t, page));
    }
    return Promise.all([
      getUpcoming(page, signal),
      tmdbFetch<TMDBResponse>("/discover/tv", { page, sort_by: "first_air_date.desc" }, signal),
    ]).then(([m, t]) => interleave(m, t, page));
  }

  // popular (default)
  if (genre) {
    return Promise.all([
      tmdbFetch<TMDBResponse>("/discover/movie", { page, sort_by: "popularity.desc", with_genres: genre }, signal),
      tmdbFetch<TMDBResponse>("/discover/tv", { page, sort_by: "popularity.desc", with_genres: tvGenre || genre }, signal),
    ]).then(([m, t]) => interleave(m, t, page));
  }
  return Promise.all([
    getPopular("movie", page, signal),
    getPopular("tv", page, signal),
  ]).then(([m, t]) => interleave(m, t, page));
}

function interleave(res1: TMDBResponse | null, res2: TMDBResponse | null, page: number): TMDBResponse {
  const m = (res1?.results || []).filter((x) => x && x.poster_path && x.media_type !== "person");
  const t = (res2?.results || []).filter((x) => x && x.poster_path && x.media_type !== "person");
  const merged: MediaItem[] = [];
  const max = Math.max(m.length, t.length);
  for (let i = 0; i < max; i++) {
    if (m[i]) { merged.push({ ...m[i], media_type: "movie" }); }
    if (t[i]) { merged.push({ ...t[i], media_type: "tv" }); }
  }
  return {
    page,
    total_pages: Math.max(res1?.total_pages || 1, res2?.total_pages || 1),
    results: merged,
    total_results: (res1?.total_results || 0) + (res2?.total_results || 0),
  };
}

export function genreNames(genresOrIds?: (number | string | { id?: number; name?: string })[] | null): string {
  if (!genresOrIds || !Array.isArray(genresOrIds)) return "";
  return genresOrIds
    .map((g) => (typeof g === "object" && g !== null && g.name ? g.name : CFG.GENRE_MAP[g as number] || String(g)))
    .join(", ");
}

export function year(dateStr: string): string {
  return dateStr ? String(dateStr).slice(0, 4) : "";
}

export function runtime(mins?: number): string {
  if (!mins || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatRating(r: number): string {
  return r ? r.toFixed(1) : "N/A";
}

export interface TrailerSource {
  type: "mp4" | "youtube";
  src: string;
}

const MAX_TRAILER_CACHE_SIZE = 300;
const trailerSourceCache = new Map<string, TrailerSource | null>();
const trailerSourceInflight = new Map<string, Promise<TrailerSource | null>>();

function setTrailerCache(key: string, val: TrailerSource | null) {
  if (trailerSourceCache.has(key)) {
    trailerSourceCache.delete(key);
  } else if (trailerSourceCache.size >= MAX_TRAILER_CACHE_SIZE) {
    const oldest = trailerSourceCache.keys().next().value;
    if (oldest) trailerSourceCache.delete(oldest);
  }
  trailerSourceCache.set(key, val);
}

export async function getTrailerSource(id: number, mediaType: string = "movie"): Promise<TrailerSource | null> {
  const normType = mediaType === "tv" || mediaType === "anime" ? "tv" : "movie";
  const key = `${normType}_${id}`;
  if (trailerSourceCache.has(key)) {
    const cached = trailerSourceCache.get(key) || null;
    // Re-insert to refresh LRU order
    trailerSourceCache.delete(key);
    trailerSourceCache.set(key, cached);
    return cached;
  }
  if (trailerSourceInflight.has(key)) {
    return trailerSourceInflight.get(key)!;
  }

  const promise = (async () => {
    try {
      // 1. Fetch TMDB official YouTube trailer (instant & reliable via cached proxy)
      const videosRes = normType === "tv" ? await getTVVideos(id) : await getMovieVideos(id);
      if (videosRes?.results?.length) {
        const ytVideos = videosRes.results.filter((v) => v.site === "YouTube" && v.key);
        const trailer =
          ytVideos.find((v) => v.type === "Trailer" && v.official) ||
          ytVideos.find((v) => v.type === "Trailer") ||
          ytVideos.find((v) => v.type === "Teaser") ||
          ytVideos[0];
        if (trailer?.key) {
          const result: TrailerSource = { type: "youtube", src: trailer.key };
          setTrailerCache(key, result);
          return result;
        }
      }

      // 2. Fallback to native MP4 trailer if available
      try {
        const res = await fetch(`https://trailer.shegu.st/trailer?tmdb=${encodeURIComponent(id)}&type=${normType}`, { signal: getTimeoutSignal(1200) });
        if (res.ok) {
          const data = await res.json();
          if (data?.url) {
            const result: TrailerSource = { type: "mp4", src: data.url };
            setTrailerCache(key, result);
            return result;
          }
        }
      } catch {}

      setTrailerCache(key, null);
      return null;
    } catch {
      setTrailerCache(key, null);
      return null;
    } finally {
      trailerSourceInflight.delete(key);
    }
  })();

  trailerSourceInflight.set(key, promise);
  return promise;
}

export async function getNativeTrailer(id: number, mediaType: string = "movie"): Promise<string | null> {
  const source = await getTrailerSource(id, mediaType);
  return source?.src || null;
}

export interface TorrentsResponse {
  success: boolean;
  imdbId?: string;
  count?: number;
  torrents: TorrentSource[];
  error?: string;
}

export async function getTorrents(
  id: string | number,
  type?: string,
  season?: number,
  episode?: number,
  customAddons?: string[]
): Promise<TorrentSource[]> {
  const normType = type === "anime" ? "tv" : (type || "movie");
  let path = `/api/torrents/${normType}/${id}`;
  if (normType === "tv") path += `/${season || 1}/${episode || 1}`;

  // 1. Fetch from server API (ThePirateBay, Bitsearch, TorrentsCSV, Nyaa, AnimeTosho, YTS, EZTV)
  const serverPromise = (async (): Promise<TorrentSource[]> => {
    try {
      const res = await fetch(path, {
        headers: { Accept: "application/json" },
        signal: getTimeoutSignal(12000),
      });
      if (res.ok) {
        const data = (await res.json()) as TorrentsResponse;
        return data.torrents || [];
      }
    } catch (err) {
      console.warn("[getTorrents] Server route error:", err);
    }
    return [];
  })();

  // 2. Fetch directly from Torrentio client-side (bypasses datacenter egress blocks)
  const clientPromise = (async (): Promise<TorrentSource[]> => {
    try {
      let imdbId = String(id).startsWith("tt") ? String(id) : "";
      if (!imdbId) {
        const tmdbType = normType === "tv" ? "tv" : "movie";
        const tmdbData = await tmdbFetch<{ imdb_id?: string }>(`/${tmdbType}/${id}/external_ids`);
        imdbId = tmdbData?.imdb_id || "";
      }
      if (!imdbId) return [];

      const isTv = normType === "tv";
      const torrentioType = isTv ? "series" : "movie";
      const target = isTv ? `${imdbId}:${season || 1}:${episode || 1}` : imdbId;
      const providers =
        "yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex,nekobt,rutor,rutracker,comando,bludv,torrent9,ilcorsaronero,mejortorrent,wolfmax4k,cinecalidad,besttorrents";
      const torrentioUrl = `https://torrentio.strem.fun/providers=${providers}/stream/${torrentioType}/${target}.json`;

      const fallbackRes = await fetch(torrentioUrl, {
        headers: { Accept: "application/json" },
        signal: getTimeoutSignal(9000),
      });

      if (fallbackRes.ok) {
        const fbData = (await fallbackRes.json()) as {
          streams?: Array<{
            title?: string;
            name?: string;
            infoHash?: string;
            behaviorHints?: { filename?: string };
            customProvider?: string;
          }>;
        };
        const streams: Array<{
          title?: string;
          name?: string;
          infoHash?: string;
          behaviorHints?: { filename?: string };
          customProvider?: string;
        }> = [...(fbData.streams || [])];

        // Also query any user custom addons
        const extraAddonUrls = [...(customAddons || [])];
        if (extraAddonUrls.length === 0 && typeof window !== "undefined") {
          try {
            const stored = JSON.parse(localStorage.getItem("cinecub_custom_addons") || "[]");
            if (Array.isArray(stored)) extraAddonUrls.push(...stored);
          } catch {}
        }

        if (extraAddonUrls.length > 0) {
          const addonPromises = extraAddonUrls.map(async (addonUrl) => {
            try {
              const baseUrl = addonUrl.replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");
              const res = await fetch(`${baseUrl}/stream/${torrentioType}/${target}.json`, {
                headers: { Accept: "application/json" },
                signal: getTimeoutSignal(8000),
              });
              if (res.ok) {
                const data = await res.json();
                let host = baseUrl;
                try { host = new URL(baseUrl).hostname.replace(/^www\./, ""); } catch {}
                const hostName = host.split(".")[0] || "Custom";
                const capHost = hostName.charAt(0).toUpperCase() + hostName.slice(1);
                return (data.streams || []).map((st: { title?: string; name?: string; infoHash?: string; behaviorHints?: { filename?: string } }) => ({
                  ...st,
                  customProvider: capHost,
                }));
              }
            } catch (err) {
              console.warn("[getTorrents] Custom addon fetch error:", err);
            }
            return [];
          });

          const addonResults = await Promise.all(addonPromises);
          for (const resList of addonResults) {
            streams.push(...resList);
          }
        }

        const publicTrackers = [
          "udp://tracker.opentrackr.org:1337/announce",
          "udp://open.stealth.si:80/announce",
          "udp://tracker.openbittorrent.com:6969/announce",
          "udp://opentracker.i2p.rocks:6969/announce",
          "udp://exodus.desync.com:6969/announce",
        ];
        const trackerQuery = publicTrackers.map((t) => `&tr=${encodeURIComponent(t)}`).join("");

        return streams
          .filter((s) => Boolean(s.infoHash))
          .map((s, idx) => {
            const rawTitle = s.title || "";
            const firstLine = rawTitle.split("\n")[0]?.trim() || s.behaviorHints?.filename || "Torrent Stream";
            const seedsM = rawTitle.match(/👤\s*(\d+)/);
            const seeds = seedsM ? parseInt(seedsM[1], 10) : 0;
            const sizeM = rawTitle.match(/💾\s*([\d.]+\s*[GMK]B)/i);
            const size = sizeM ? sizeM[1].trim() : "";
            const provM = rawTitle.match(/⚙️\s*([^\n\r]+)/);
            let provider = (s as { customProvider?: string }).customProvider || (provM ? provM[1].trim() : "Torrent");
            if (provider.toLowerCase() === "torrentio") provider = "Multi-Indexer";

            let quality = (s.name || "").replace(/^Torrentio\n?/i, "").trim();
            if (!quality || quality.toLowerCase() === "torrentio") {
              if (/4k|2160p/i.test(firstLine)) quality = "4K";
              else if (/1080p/i.test(firstLine)) quality = "1080p";
              else if (/720p/i.test(firstLine)) quality = "720p";
              else quality = "HD";
            }

            const cleanName = firstLine.replace(/[^\w\s.-]/gi, " ").trim();
            const magnet = `magnet:?xt=urn:btih:${s.infoHash!.toLowerCase()}&dn=${encodeURIComponent(cleanName || "video")}${trackerQuery}`;
            const labelParts = [`[${quality}]`, provider];
            if (seeds > 0) labelParts.push(`• ${seeds} seeds`);
            if (size) labelParts.push(`(${size})`);

            return {
              id: `torrentio_${s.infoHash!.toLowerCase()}_${idx}`,
              name: labelParts.join(" "),
              title: firstLine,
              infoHash: s.infoHash!.toLowerCase(),
              magnet,
              quality,
              seeds,
              size,
              provider,
            };
          });
      }
    } catch (err) {
      console.warn("[getTorrents] Client fallback error:", err);
    }
    return [];
  })();

  const [serverList, clientList] = await Promise.all([serverPromise, clientPromise]);
  const combined = [...serverList, ...clientList];

  if (combined.length === 0) return [];

  // Deduplicate by lowercase infoHash
  const dedupe = new Map<string, TorrentSource>();
  for (const item of combined) {
    const hash = item.infoHash.toLowerCase();
    if (!hash || hash.length !== 40) continue;
    const existing = dedupe.get(hash);
    if (!existing) {
      dedupe.set(hash, { ...item });
    } else {
      if (item.seeds > existing.seeds) existing.seeds = item.seeds;
      if (!existing.size && item.size) existing.size = item.size;
      if (
        (existing.provider === "Torrent" || existing.provider === "Multi-Indexer") &&
        item.provider !== "Torrent" &&
        item.provider !== "Multi-Indexer"
      ) {
        existing.provider = item.provider;
      }
      const labelParts = [`[${existing.quality}]`, existing.provider];
      if (existing.seeds > 0) labelParts.push(`• ${existing.seeds} seeds`);
      if (existing.size) labelParts.push(`(${existing.size})`);
      existing.name = labelParts.join(" ");
    }
  }

  return Array.from(dedupe.values()).sort((a, b) => {
    if (b.seeds !== a.seeds) return b.seeds - a.seeds;
    const qScore = (q: string) => (/4k|2160p/i.test(q) ? 4 : /1080p/i.test(q) ? 3 : /720p/i.test(q) ? 2 : 1);
    return qScore(b.quality) - qScore(a.quality);
  });
}
