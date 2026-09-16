import type { MetadataRoute } from "next";

const TMDB_KEY = process.env.TMDB_API_KEY || "";
const BASE_URL = "https://cinecub.stream";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Core static & category pages
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/?page=browse&cat=movie`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/?page=browse&cat=tv`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/?page=browse&cat=anime`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/?page=browse&cat=trending`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/?page=browse&cat=popular`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/?page=browse&cat=toprated`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: `${BASE_URL}/?page=browse&cat=upcoming`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.75,
    },
    // Top Movie Genres
    { url: `${BASE_URL}/?page=browse&cat=movie&genre=28`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=movie&genre=878`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=movie&genre=27`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=movie&genre=35`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=movie&genre=12`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=movie&genre=16`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=movie&genre=80`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=movie&genre=53`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=movie&genre=10749`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    // Top TV Genres
    { url: `${BASE_URL}/?page=browse&cat=tv&genre=10759`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=tv&genre=10765`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=tv&genre=16`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=tv&genre=18`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=tv&genre=35`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE_URL}/?page=browse&cat=tv&genre=9648`, lastModified: now, changeFrequency: "daily", priority: 0.75 },
  ];

  try {
    // Concurrently fetch trending, popular movies, popular TV, and top anime
    const endpoints = [
      `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_KEY}`,
      `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}`,
      `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_KEY}`,
      `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc`,
    ];

    const responses = await Promise.allSettled(
      endpoints.map((url) =>
        fetch(url, {
          headers: { accept: "application/json" },
          next: { revalidate: 3600 },
        }).then((res) => (res.ok ? res.json() : null))
      )
    );

    const dynamicRoutes: MetadataRoute.Sitemap = [];
    const seen = new Set<string>();

    for (const settled of responses) {
      if (settled.status === "fulfilled" && settled.value?.results) {
        for (const item of settled.value.results) {
          if (!item?.id) continue;
          const mediaType = item.media_type === "tv" || (!item.title && item.name) ? "tv" : "movie";
          const key = `${mediaType}-${item.id}`;
          if (seen.has(key)) continue;
          seen.add(key);

          dynamicRoutes.push({
            url: `${BASE_URL}/?id=${item.id}&type=${mediaType}`,
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.85,
          });
        }
      }
    }

    if (dynamicRoutes.length > 0) {
      return [...staticRoutes, ...dynamicRoutes];
    }
  } catch {
    // Graceful fallback to static routes if external TMDB request fails
  }

  return staticRoutes;
}
