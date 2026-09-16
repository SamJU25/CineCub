import { tmdb } from "./tmdb";

const STREMIO_OS_BASE = "https://opensubtitles-v3.strem.io/subtitles";

const MAX_IMDB_CACHE = 1000;
const imdbIdCache = new Map<string, string>();

function setCachedImdbId(key: string, val: string) {
  if (imdbIdCache.size >= MAX_IMDB_CACHE) {
    const oldestKey = imdbIdCache.keys().next().value;
    if (oldestKey) imdbIdCache.delete(oldestKey);
  }
  imdbIdCache.set(key, val);
}

export async function resolveImdbId(
  tmdbId: string | number,
  mediaType: "movie" | "tv" = "movie",
  apiKey?: string
): Promise<string | null> {
  if (!tmdbId) return null;
  const strId = String(tmdbId).trim();
  if (strId.startsWith("tt")) return strId;

  const type = mediaType === "tv" ? "tv" : "movie";
  const cacheKey = `${type}_${strId}`;
  if (imdbIdCache.has(cacheKey)) {
    const val = imdbIdCache.get(cacheKey)!;
    imdbIdCache.delete(cacheKey);
    imdbIdCache.set(cacheKey, val);
    return val;
  }

  try {
    const ext = await tmdb<{ imdb_id?: string }>(`/${type}/${strId}/external_ids`, {}, apiKey);
    if (ext && ext.imdb_id) {
      setCachedImdbId(cacheKey, ext.imdb_id);
      return ext.imdb_id;
    }
  } catch (err) {
    console.warn("[subtitles] Failed to resolve IMDb ID for TMDB ID", tmdbId, err);
  }
  return null;
}

function normalizeLang(lang: string): string[] {
  const l = (lang || "en").toLowerCase().trim();
  if (l === "en" || l === "eng") return ["eng", "en"];
  if (l === "es" || l === "spa") return ["spa", "es"];
  if (l === "fr" || l === "fre" || l === "fra") return ["fre", "fra", "fr"];
  if (l === "de" || l === "ger" || l === "deu") return ["ger", "deu", "de"];
  if (l === "it" || l === "ita") return ["ita", "it"];
  if (l === "pt" || l === "por" || l === "pob") return ["por", "pob", "pt"];
  if (l === "ar" || l === "ara") return ["ara", "ar"];
  if (l === "ru" || l === "rus") return ["rus", "ru"];
  if (l === "ja" || l === "jpn") return ["jpn", "ja"];
  if (l === "ko" || l === "kor") return ["kor", "ko"];
  if (l === "zh" || l === "chi" || l === "zho") return ["chi", "zho", "zh"];
  return [l];
}

export interface OpenSubtitleMatch {
  ref: string;
  name: string;
  lang: string;
  hi: boolean;
  ext: string;
  url: string;
  source: string;
}

const MAX_OS_SEARCH_CACHE = 500;
const osSearchCache = new Map<string, OpenSubtitleMatch[]>();

function setCachedOsSearch(key: string, val: OpenSubtitleMatch[]) {
  if (osSearchCache.size >= MAX_OS_SEARCH_CACHE) {
    const oldestKey = osSearchCache.keys().next().value;
    if (oldestKey) osSearchCache.delete(oldestKey);
  }
  osSearchCache.set(key, val);
}

export async function searchOpenSubtitles(
  imdbId: string,
  mediaType: "movie" | "tv" = "movie",
  season = 1,
  episode = 1,
  lang = "EN"
): Promise<OpenSubtitleMatch[]> {
  if (!imdbId) return [];

  const isTv = mediaType === "tv";
  const cacheKey = isTv ? `${imdbId}:${season}:${episode}:${lang}` : `${imdbId}:${lang}`;

  if (osSearchCache.has(cacheKey)) {
    const val = osSearchCache.get(cacheKey)!;
    osSearchCache.delete(cacheKey);
    osSearchCache.set(cacheKey, val);
    return val;
  }

  const targetPath = isTv
    ? `/series/${imdbId}:${season || 1}:${episode || 1}.json`
    : `/movie/${imdbId}.json`;

  const url = `${STREMIO_OS_BASE}${targetPath}`;
  const validLangs = normalizeLang(lang);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CineCub-Storefront/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];

    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.subtitles)) return [];

    const matches: OpenSubtitleMatch[] = [];
    for (const sub of data.subtitles) {
      if (!sub.url) continue;
      const subLang = (sub.lang || "").toLowerCase();
      if (validLangs.some((l) => subLang === l || subLang.startsWith(l))) {
        const encodedUrl = btoa(sub.url)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
        matches.push({
          ref: `os_${encodedUrl}`,
          name:
            sub.subtitleFileName ||
            (sub.movieReleaseName ? `${sub.movieReleaseName}.srt` : `OpenSubtitles (${sub.lang})`),
          lang: (sub.lang === "eng" ? "EN" : sub.lang || "EN").toUpperCase(),
          hi: !!sub.hi,
          ext: "srt",
          url: sub.url,
          source: "OpenSubtitles",
        });
      }
    }

    setCachedOsSearch(cacheKey, matches);
    return matches;
  } catch (err) {
    console.warn("[subtitles] OpenSubtitles query failed:", err);
    return [];
  }
}

export interface SubtitleEntry {
  ref: string;
  name: string;
  lang: string;
  hi: boolean;
  ext: string;
  url?: string;
  size?: number;
  source: string;
}

const SUBDL_SEARCH_BASE = "https://api.subdl.com/api/v1/subtitles";
const MAX_SUBDL_CACHE = 500;
const subdlSearchCache = new Map<string, SubtitleEntry[]>();

function setCachedSubdlSearch(key: string, val: SubtitleEntry[]) {
  if (subdlSearchCache.size >= MAX_SUBDL_CACHE) {
    const oldestKey = subdlSearchCache.keys().next().value;
    if (oldestKey) subdlSearchCache.delete(oldestKey);
  }
  subdlSearchCache.set(key, val);
}

export async function searchSubDL(
  tmdbId: string | number,
  mediaType: "movie" | "tv" = "movie",
  season = 1,
  episode = 1,
  lang = "EN",
  apiKey?: string
): Promise<SubtitleEntry[]> {
  const key = apiKey || process.env.SUBDL_API_KEY || "";
  if (!tmdbId || !key) return [];

  const strId = String(tmdbId).trim();
  const type = mediaType === "tv" ? "tv" : "movie";
  const cleanLang = (lang || "EN").toUpperCase();
  const cacheKey = type === "tv" ? `subdl:${strId}:${season}:${episode}:${cleanLang}` : `subdl:${strId}:${cleanLang}`;

  if (subdlSearchCache.has(cacheKey)) {
    const val = subdlSearchCache.get(cacheKey)!;
    subdlSearchCache.delete(cacheKey);
    subdlSearchCache.set(cacheKey, val);
    return val;
  }

  const queryParams = new URLSearchParams({
    api_key: key,
    tmdb_id: strId,
    type,
    languages: cleanLang,
    unpack: "1",
  });

  if (type === "tv") {
    if (season > 0) queryParams.set("season_number", String(season));
    if (episode > 0) queryParams.set("episode_number", String(episode));
  }

  try {
    const res = await fetch(`${SUBDL_SEARCH_BASE}?${queryParams.toString()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CineCub-Storefront/1.0",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];

    const data = await res.json().catch(() => null);
    if (!data || !data.status || !Array.isArray(data.subtitles)) return [];

    const entries: SubtitleEntry[] = [];
    const seenRefs = new Set<string>();

    for (const sub of data.subtitles) {
      if (Array.isArray(sub.unpack_files) && sub.unpack_files.length > 0) {
        for (const f of sub.unpack_files) {
          if (!f.url) continue;
          const rawRef = f.url.split("?")[0].replace(/^\/subtitle\//, "");
          if (!rawRef || seenRefs.has(rawRef)) continue;

          if (type === "tv" && episode > 0 && f.episode > 0 && f.episode !== episode) continue;
          if (type === "tv" && season > 0 && f.season > 0 && f.season !== season) continue;

          seenRefs.add(rawRef);
          const encoded = btoa(rawRef).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          entries.push({
            ref: `subdl_${encoded}`,
            name: f.name || f.release_name || sub.name || "SubDL Subtitle",
            lang: (f.language || cleanLang).toUpperCase(),
            hi: !!f.hi,
            ext: (f.format || "srt").toLowerCase(),
            size: f.size,
            source: "SubDL",
          });
        }
      } else if (sub.url) {
        const rawRef = sub.url.split("?")[0].replace(/^\/subtitle\//, "");
        if (!rawRef || seenRefs.has(rawRef)) continue;

        if (type === "tv" && episode > 0 && sub.episode > 0 && sub.episode !== episode) continue;
        if (type === "tv" && season > 0 && sub.season > 0 && sub.season !== season) continue;

        seenRefs.add(rawRef);
        const encoded = btoa(rawRef).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        entries.push({
          ref: `subdl_${encoded}`,
          name: sub.name || sub.release_name || "SubDL Subtitle",
          lang: (sub.language || cleanLang).toUpperCase(),
          hi: !!sub.hi,
          ext: (sub.format || "srt").toLowerCase(),
          size: sub.size,
          source: "SubDL",
        });
      }
    }

    setCachedSubdlSearch(cacheKey, entries);
    return entries;
  } catch (err) {
    console.warn("[subtitles] SubDL search failed:", err);
    return [];
  }
}

export function convertSrtToVtt(srtContent: string): string {
  if (!srtContent) return "WEBVTT\n\n";

  let s = srtContent.replace(/^\uFEFF/, "");
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (s.trim().toUpperCase().startsWith("WEBVTT")) {
    return s;
  }

  const blocks = s.trim().split(/\n\n+/);
  const out = ["WEBVTT\n\n"];

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (!lines.length) continue;

    if (/^\d+$/.test(lines[0].trim()) && lines[1] && lines[1].includes("-->")) {
      lines.shift();
    }

    const converted = lines.map((line) => {
      if (line.includes("-->")) {
        return line.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
      }
      return line
        .replace(/<font[^>]*>/gi, "")
        .replace(/<\/font>/gi, "")
        .replace(/\{[^}]+\}/g, "");
    });

    out.push(converted.join("\n") + "\n\n");
  }

  return out.join("");
}

export async function transcribeWithWhisper(
  ai: { run: (model: string, input: { audio: number[] }) => Promise<{ vtt?: string; text?: string } | null> },
  audioData: ArrayBuffer | Uint8Array
): Promise<string> {
  if (!ai || typeof ai.run !== "function") {
    throw new Error("CLOUDFLARE_AI_NOT_BOUND");
  }

  const inputBytes = audioData instanceof Uint8Array ? audioData : new Uint8Array(audioData);

  const result = await ai.run("@cf/openai/whisper", {
    audio: [...inputBytes],
  });

  if (result && result.vtt) {
    return result.vtt;
  }

  if (result && result.text) {
    return `WEBVTT\n\n00:00:00.000 --> 00:00:30.000\n${result.text.trim()}\n`;
  }

  return "WEBVTT\n\n";
}
