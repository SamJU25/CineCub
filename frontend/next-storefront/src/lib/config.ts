export const CFG = {
  BASE: "/api/tmdb",
  RENDER_API: "",
  SPOTLIGHT_INTERVAL: 10000,
  SERVERS: [
    {
      id: "vidlink", name: "Server 1 (VidLink - Fast)",
      movie: (id: number) => `https://vidlink.pro/movie/${id}`,
      tv: (id: number, s: number, e: number) => `https://vidlink.pro/tv/${id}/${s || 1}/${e || 1}`,
      url: (id: number, type: string, s?: number, e?: number) =>
        type === "movie" ? `https://vidlink.pro/movie/${id}` : `https://vidlink.pro/tv/${id}/${s || 1}/${e || 1}`,
    },
    {
      id: "autoembed", name: "Server 2 (AutoEmbed - Multi)",
      movie: (id: number) => `https://player.autoembed.co/embed/movie/${id}`,
      tv: (id: number, s: number, e: number) => `https://player.autoembed.co/embed/tv/${id}/${s || 1}/${e || 1}`,
      url: (id: number, type: string, s?: number, e?: number) =>
        type === "movie" ? `https://player.autoembed.co/embed/movie/${id}` : `https://player.autoembed.co/embed/tv/${id}/${s || 1}/${e || 1}`,
    },
    {
      id: "vidsrc", name: "Server 3 (VidSrc)",
      movie: (id: number) => `https://vidsrc.sbs/embed/movie/${id}`,
      tv: (id: number, s: number, e: number) => `https://vidsrc.sbs/embed/tv/${id}/${s || 1}/${e || 1}`,
      url: (id: number, type: string, s?: number, e?: number) =>
        type === "movie" ? `https://vidsrc.sbs/embed/movie/${id}` : `https://vidsrc.sbs/embed/tv/${id}/${s || 1}/${e || 1}`,
    },
    {
      id: "superembed", name: "Server 4 (SuperEmbed)",
      movie: (id: number) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
      tv: (id: number, s: number, e: number) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s || 1}&e=${e || 1}`,
      url: (id: number, type: string, s?: number, e?: number) =>
        type === "movie" ? `https://multiembed.mov/?video_id=${id}&tmdb=1` : `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s || 1}&e=${e || 1}`,
    },
    {
      id: "smashystream", name: "Server 5 (SmashyStream)",
      movie: (id: number) => `https://player.smashystream.com/movie/${id}`,
      tv: (id: number, s: number, e: number) => `https://player.smashystream.com/tv/${id}/${s || 1}/${e || 1}`,
      url: (id: number, type: string, s?: number, e?: number) =>
        type === "movie" ? `https://player.smashystream.com/movie/${id}` : `https://player.smashystream.com/tv/${id}/${s || 1}/${e || 1}`,
    },
    {
      id: "vsembed", name: "Server 6 (VSEmbed)",
      movie: (id: number) => `https://vsembed.ru/embed/movie/${id}`,
      tv: (id: number, s: number, e: number) => `https://vsembed.ru/embed/tv/${id}/${s || 1}-${e || 1}`,
      url: (id: number, type: string, s?: number, e?: number) =>
        type === "movie" ? `https://vsembed.ru/embed/movie/${id}` : `https://vsembed.ru/embed/tv/${id}/${s || 1}-${e || 1}`,
    },
  ],
  GENRES: [
    { id: 28, name: "Action" },
    { id: 35, name: "Comedy" },
    { id: 27, name: "Horror" },
    { id: 878, name: "Sci-Fi" },
    { id: 18, name: "Drama" },
    { id: 10749, name: "Romance" },
    { id: 80, name: "Crime" },
    { id: 14, name: "Fantasy" },
    { id: 53, name: "Thriller" },
    { id: 12, name: "Adventure" },
    { id: 9648, name: "Mystery" },
  ],
  GENRE_MAP: {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
    10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
    10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
  } as Record<number, string>,
  TV_GENRE_REMAP: {
    28: 10759,
    12: 10759,
    878: 10765,
    14: 10765,
    27: 9648,
    10749: 18,
    53: 9648,
  } as Record<number, number>,
  DEAD_HOSTS: ["cf.streamflixserver.site"],
};

export const IMG = {
  poster: (path: string | null | undefined, size = "w500") =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : null,
  backdrop: (path: string | null | undefined, size = "w1280") =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : null,
  profile: (path: string | null | undefined, size = "w185") =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : null,
  placeholder: (w = 300, h = 450) =>
    `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' fill='%2312121f'%3E%3Crect width='100%25' height='100%25'/%3E%3C/svg%3E`,
};
