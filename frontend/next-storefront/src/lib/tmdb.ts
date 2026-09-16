import { getCineCubBindings } from "./cloudflare";

const TMDB_BASE = "https://api.themoviedb.org/3";

export function slugify(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildSlug(item: { id: number; title?: string; name?: string }): string {
  const title = item.title || item.name || "";
  const slug = slugify(title);
  return slug ? `${item.id}-${slug}` : `${item.id}`;
}

export function parseSlug(slug: string): number | null {
  const id = parseInt(String(slug || ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function tmdb<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  apiKey?: string
): Promise<T | null> {
  const bindings = await getCineCubBindings();
  const key = (apiKey || bindings.TMDB_API_KEY || process.env.TMDB_API_KEY || "").trim();
  if (!key) {
    console.error("[tmdb] TMDB_API_KEY is not configured");
    return null;
  }

  const url = new URL(TMDB_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  url.searchParams.set("api_key", key);

  try {
    const res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      console.error(`[tmdb] ${path} responded ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error("[tmdb] fetch failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export function getMovie(id: number | string, apiKey?: string) {
  return tmdb(`/movie/${id}`, { append_to_response: "credits,recommendations" }, apiKey);
}

export function getSeries(id: number | string, apiKey?: string) {
  return tmdb(`/tv/${id}`, { append_to_response: "credits,recommendations" }, apiKey);
}

export function getTrending(apiKey?: string, page = 1) {
  return tmdb("/trending/all/week", { page }, apiKey);
}

export function getPopular(type: "movie" | "tv", apiKey?: string, page = 1) {
  return tmdb(`/${type}/popular`, { page }, apiKey);
}

export function getAnime(apiKey?: string, page = 1) {
  return tmdb(
    "/discover/tv",
    { with_genres: "16", with_original_language: "ja", sort_by: "popularity.desc", page },
    apiKey
  );
}

export function formatRuntime(mins: number): string {
  if (!mins || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function year(dateStr: string): string {
  return dateStr ? String(dateStr).slice(0, 4) : "";
}
