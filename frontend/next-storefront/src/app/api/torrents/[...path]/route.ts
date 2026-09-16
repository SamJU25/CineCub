import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";

interface TorrentioStream {
  name: string;
  title: string;
  infoHash: string;
  fileIdx?: number;
  behaviorHints?: {
    filename?: string;
    bingeGroup?: string;
  };
}

interface FormattedTorrent {
  id: string;
  name: string;
  title: string;
  infoHash: string;
  magnet: string;
  quality: string;
  seeds: number;
  size: string;
  provider: string;
  filename?: string;
  fileIdx?: number;
}

const CACHE = new Map<string, { data: FormattedTorrent[]; ts: number; imdbId?: string }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const PUBLIC_TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.openbittorrent.com:6969/announce",
  "udp://opentracker.i2p.rocks:6969/announce",
  "udp://tracker.internetwarriors.net:1337/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.tiny-vps.com:6969/announce",
  "udp://9.rarbg.to:2920/announce",
  "udp://open.demonii.com:1337/announce",
];

const TRACKER_QUERY = PUBLIC_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join("");

function buildMagnet(infoHash: string, name: string): string {
  const cleanName = name.replace(/[^\w\s.-]/gi, " ").trim();
  return `magnet:?xt=urn:btih:${infoHash.toLowerCase()}&dn=${encodeURIComponent(cleanName || "video")}${TRACKER_QUERY}`;
}

function detectQuality(text: string): string {
  if (/4k|2160p/i.test(text)) return "4K";
  if (/1080p/i.test(text)) return "1080p";
  if (/720p/i.test(text)) return "720p";
  if (/480p/i.test(text)) return "480p";
  return "HD";
}

function normalizeProviderName(raw: string): string {
  const p = raw.trim().toLowerCase();
  if (p.includes("1337x") || p.includes("1337")) return "1337x";
  if (p.includes("thepiratebay") || p.includes("piratebay") || p === "tpb") return "ThePirateBay";
  if (p.includes("torrentgalaxy") || p === "tgx") return "TorrentGalaxy";
  if (p.includes("rarbg")) return "RARBG";
  if (p.includes("yts") || p.includes("yify")) return "YTS";
  if (p.includes("eztv")) return "EZTV";
  if (p.includes("nyaasi") || p.includes("nyaa")) return "Nyaa";
  if (p.includes("rutracker")) return "RuTracker";
  if (p.includes("rutor")) return "RuTor";
  if (p.includes("kickass") || p === "kat") return "KickassTorrents";
  if (p.includes("magnetdl")) return "MagnetDL";
  if (p.includes("horriblesubs")) return "HorribleSubs";
  if (p.includes("tokyotosho")) return "TokyoTosho";
  if (p.includes("anidex")) return "AniDex";
  if (p.includes("nekobt")) return "NekoBT";
  if (p.includes("comando")) return "Comando";
  if (p.includes("bludv")) return "BluDV";
  if (p.includes("micoleaodublado") || p.includes("coleao")) return "Coleao";
  if (p.includes("torrent9")) return "Torrent9";
  if (p.includes("ilcorsaronero")) return "IlCorsaroNero";
  if (p.includes("mejortorrent")) return "MejorTorrent";
  if (p.includes("wolfmax4k") || p.includes("wolfmax")) return "Wolfmax4K";
  if (p.includes("cinecalidad")) return "CineCalidad";
  if (p.includes("besttorrents")) return "BestTorrents";
  if (p.includes("ext")) return "EXT";
  if (p.includes("bitsearch")) return "Bitsearch";
  if (p.includes("torrentscsv") || p.includes("opentorrents")) return "TorrentsCSV";
  if (p.includes("animetosho") || p.includes("tosho")) return "AnimeTosho";
  if (p === "torrentio") return "Multi-Indexer";
  return raw.trim() || "Torrent";
}

function parseTorrentioStream(stream: TorrentioStream, idx: number): FormattedTorrent | null {
  if (!stream.infoHash) return null;
  const title = stream.title || "";
  const name = stream.name || "";
  const filename = stream.behaviorHints?.filename;

  // Extract seeds (👤 284)
  const seedsMatch = title.match(/👤\s*(\d+)/);
  const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : 0;

  // Extract size (💾 8.91 GB)
  const sizeMatch = title.match(/💾\s*([\d.]+\s*[GMK]B)/i);
  const size = sizeMatch ? sizeMatch[1].trim() : "";

  // Extract provider (⚙️ 1337x)
  const providerMatch = title.match(/⚙️\s*([^\n\r]+)/);
  let provider = providerMatch ? normalizeProviderName(providerMatch[1]) : "Torrent";
  if (provider.toLowerCase() === "torrentio") provider = "Multi-Indexer";

  // Clean title: first line before emoji stats
  const firstLine = title.split("\n")[0]?.trim() || filename || "Torrent Stream";

  // Clean resolution / quality
  let quality = name.replace(/^Torrentio\n?/i, "").trim();
  if (!quality || quality.toLowerCase() === "torrentio") {
    quality = detectQuality(firstLine);
  }

  const magnet = buildMagnet(stream.infoHash, filename || firstLine);

  const labelParts = [`[${quality}]`, provider];
  if (seeds > 0) labelParts.push(`• ${seeds} seeds`);
  if (size) labelParts.push(`(${size})`);
  const displayName = labelParts.join(" ");

  return {
    id: `torrent_${stream.infoHash.toLowerCase()}_${idx}`,
    name: displayName,
    title: firstLine,
    infoHash: stream.infoHash.toLowerCase(),
    magnet,
    quality,
    seeds,
    size,
    provider,
    filename,
    fileIdx: stream.fileIdx,
  };
}

// 1. Fetch Torrentio with 25+ providers
async function fetchTorrentio(
  isTv: boolean,
  imdbId: string,
  season: number,
  episode: number,
  signal: AbortSignal
): Promise<FormattedTorrent[]> {
  const torrentioType = isTv ? "series" : "movie";
  const streamTarget = isTv ? `${imdbId}:${season}:${episode}` : imdbId;
  const providers =
    "yts,eztv,rarbg,1337x,ext,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex,nekobt,rutor,rutracker,comando,bludv,micoleaodublado,torrent9,ilcorsaronero,mejortorrent,wolfmax4k,cinecalidad,besttorrents";
  const url = `https://torrentio.strem.fun/providers=${providers}/stream/${torrentioType}/${streamTarget}.json`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { streams?: TorrentioStream[] };
    const list = data.streams || [];
    return list
      .map((s, idx) => parseTorrentioStream(s, idx))
      .filter((s): s is FormattedTorrent => s !== null);
  } catch (err) {
    console.warn("[/api/torrents] Torrentio fetch error:", err);
    return [];
  }
}

// 2. Fetch direct Bitsearch API
async function fetchBitsearch(query: string, signal: AbortSignal): Promise<FormattedTorrent[]> {
  if (!query) return [];
  try {
    const url = `https://bitsearch.to/api/v1/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        title?: string;
        infohash?: string;
        size?: number;
        seeders?: number;
      }>;
    };
    const items = data.results || [];
    const results: FormattedTorrent[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const hash = (item.infohash || "").trim().toLowerCase();
      const title = (item.title || "").trim();
      if (!hash || hash.length !== 40) continue;

      const seeds = item.seeders || 0;
      const sizeBytes = item.size || 0;
      let size = "";
      if (sizeBytes > 1024 * 1024 * 1024) {
        size = `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      } else if (sizeBytes > 1024 * 1024) {
        size = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      }

      const quality = detectQuality(title);
      const magnet = buildMagnet(hash, title);
      const labelParts = [`[${quality}]`, "Bitsearch"];
      if (seeds > 0) labelParts.push(`• ${seeds} seeds`);
      if (size) labelParts.push(`(${size})`);

      results.push({
        id: `bitsearch_${hash}_${i}`,
        name: labelParts.join(" "),
        title,
        infoHash: hash,
        magnet,
        quality,
        seeds,
        size,
        provider: "Bitsearch",
      });
    }
    return results;
  } catch (err) {
    console.warn("[/api/torrents] Bitsearch fetch error:", err);
    return [];
  }
}

// 3. Fetch direct Nyaa.si RSS API
async function fetchNyaa(query: string, signal: AbortSignal): Promise<FormattedTorrent[]> {
  if (!query) return [];
  try {
    const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=0_0&f=0`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/rss+xml, text/xml, application/xml",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal,
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    const results: FormattedTorrent[] = [];

    itemMatches.slice(0, 30).forEach((chunk, idx) => {
      const titleM = chunk.match(/<title>([\s\S]*?)<\/title>/);
      const hashM = chunk.match(/<nyaa:infoHash>([a-fA-F0-9]{40})<\/nyaa:infoHash>/);
      const seedsM = chunk.match(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/);
      const sizeM = chunk.match(/<nyaa:size>([^<]+)<\/nyaa:size>/);

      const rawTitle = titleM ? titleM[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim() : "";
      const hash = (hashM ? hashM[1] : "").toLowerCase();
      if (!hash || hash.length !== 40 || !rawTitle) return;

      const seeds = seedsM ? parseInt(seedsM[1], 10) : 0;
      const size = sizeM ? sizeM[1].trim() : "";
      const quality = detectQuality(rawTitle);
      const magnet = buildMagnet(hash, rawTitle);

      const labelParts = [`[${quality}]`, "Nyaa"];
      if (seeds > 0) labelParts.push(`• ${seeds} seeds`);
      if (size) labelParts.push(`(${size})`);

      results.push({
        id: `nyaa_${hash}_${idx}`,
        name: labelParts.join(" "),
        title: rawTitle,
        infoHash: hash,
        magnet,
        quality,
        seeds,
        size,
        provider: "Nyaa",
      });
    });
    return results;
  } catch (err) {
    console.warn("[/api/torrents] Nyaa fetch error:", err);
    return [];
  }
}

// 4. Fetch direct Torrents-CSV (Decentralized Open Torrent Database)
async function fetchTorrentsCsv(query: string, signal: AbortSignal): Promise<FormattedTorrent[]> {
  if (!query) return [];
  try {
    const url = `https://torrents-csv.com/service/search?q=${encodeURIComponent(query)}&size=35`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      torrents?: Array<{
        name?: string;
        infohash?: string;
        size_bytes?: number;
        seeders?: number;
      }>;
    };
    const items = data.torrents || [];
    const results: FormattedTorrent[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const hash = (item.infohash || "").trim().toLowerCase();
      const title = (item.name || "").trim();
      if (!hash || hash.length !== 40 || !title) continue;

      const seeds = item.seeders || 0;
      const sizeBytes = item.size_bytes || 0;
      let size = "";
      if (sizeBytes > 1024 * 1024 * 1024) {
        size = `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      } else if (sizeBytes > 1024 * 1024) {
        size = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      }

      const quality = detectQuality(title);
      const magnet = buildMagnet(hash, title);
      const labelParts = [`[${quality}]`, "TorrentsCSV"];
      if (seeds > 0) labelParts.push(`• ${seeds} seeds`);
      if (size) labelParts.push(`(${size})`);

      results.push({
        id: `tcsv_${hash}_${i}`,
        name: labelParts.join(" "),
        title,
        infoHash: hash,
        magnet,
        quality,
        seeds,
        size,
        provider: "TorrentsCSV",
      });
    }
    return results;
  } catch (err) {
    console.warn("[/api/torrents] Torrents-CSV fetch error:", err);
    return [];
  }
}

// 5. Fetch direct AnimeTosho API (Multi-Source Anime / Releases)
async function fetchAnimeTosho(query: string, signal: AbortSignal): Promise<FormattedTorrent[]> {
  if (!query) return [];
  try {
    const url = `https://feed.animetosho.org/json?q=${encodeURIComponent(query)}&limit=35`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal,
    });
    if (!res.ok) return [];
    const items = (await res.json()) as Array<{
      title?: string;
      info_hash?: string;
      total_size?: number;
      seeders?: number;
      magnet_uri?: string;
      nyaa_id?: number | null;
      anidex_id?: number | null;
    }>;
    if (!Array.isArray(items)) return [];

    const results: FormattedTorrent[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const hash = (item.info_hash || "").trim().toLowerCase();
      const title = (item.title || "").trim();
      if (!hash || hash.length !== 40 || !title) continue;

      const seeds = item.seeders || 0;
      const sizeBytes = item.total_size || 0;
      let size = "";
      if (sizeBytes > 1024 * 1024 * 1024) {
        size = `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      } else if (sizeBytes > 1024 * 1024) {
        size = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      }

      const quality = detectQuality(title);
      const magnet = item.magnet_uri || buildMagnet(hash, title);

      let provider = "AnimeTosho";
      if (item.nyaa_id) provider = "Nyaa";
      else if (item.anidex_id) provider = "AniDex";

      const labelParts = [`[${quality}]`, provider];
      if (seeds > 0) labelParts.push(`• ${seeds} seeds`);
      if (size) labelParts.push(`(${size})`);

      results.push({
        id: `tosho_${hash}_${i}`,
        name: labelParts.join(" "),
        title,
        infoHash: hash,
        magnet,
        quality,
        seeds,
        size,
        provider,
      });
    }
    return results;
  } catch (err) {
    console.warn("[/api/torrents] AnimeTosho fetch error:", err);
    return [];
  }
}

// 6. Fetch direct Apibay (ThePirateBay API)
async function fetchApibay(
  isTv: boolean,
  imdbId: string,
  season: number,
  episode: number,
  signal: AbortSignal,
  textFallback?: string
): Promise<FormattedTorrent[]> {
  let query = imdbId;
  if (isTv && imdbId) {
    query = `${imdbId} s${String(season).padStart(2, "0")}e${String(episode).padStart(2, "0")}`;
  } else if (!imdbId && textFallback) {
    query = textFallback;
  }
  if (!query) return [];

  const queryUrl = (q: string) => `https://apibay.org/q.php?q=${encodeURIComponent(q)}`;

  try {
    let res = await fetch(queryUrl(query), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal,
    });
    if (!res.ok && textFallback && textFallback !== query) {
      res = await fetch(queryUrl(textFallback), {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        signal,
      });
    }
    if (!res.ok) return [];
    const items = (await res.json()) as Array<{
      name?: string;
      info_hash?: string;
      seeders?: string | number;
      size?: string | number;
    }>;
    if (!Array.isArray(items)) return [];

    const results: FormattedTorrent[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const hash = (item.info_hash || "").trim().toLowerCase();
      const title = (item.name || "").trim();
      if (!hash || hash.length !== 40 || title === "No results returned") continue;

      const seeds = parseInt(String(item.seeders || 0), 10) || 0;
      const sizeBytes = parseInt(String(item.size || 0), 10) || 0;
      let size = "";
      if (sizeBytes > 1024 * 1024 * 1024) {
        size = `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      } else if (sizeBytes > 1024 * 1024) {
        size = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      }

      const quality = detectQuality(title);
      const magnet = buildMagnet(hash, title);
      const labelParts = [`[${quality}]`, "ThePirateBay"];
      if (seeds > 0) labelParts.push(`• ${seeds} seeds`);
      if (size) labelParts.push(`(${size})`);

      results.push({
        id: `apibay_${hash}_${i}`,
        name: labelParts.join(" "),
        title,
        infoHash: hash,
        magnet,
        quality,
        seeds,
        size,
        provider: "ThePirateBay",
      });
    }
    return results;
  } catch (err) {
    console.warn("[/api/torrents] Apibay fetch error:", err);
    return [];
  }
}

// 3. Fetch direct YTS API (for movies)
async function fetchYts(imdbId: string, signal: AbortSignal): Promise<FormattedTorrent[]> {
  const mirrors = ["yts.bz", "yts.lt", "yts.ag"];
  for (const domain of mirrors) {
    try {
      const url = `https://${domain}/api/v2/list_movies.json?query_term=${encodeURIComponent(imdbId)}`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        signal,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        data?: {
          movies?: Array<{
            title_long?: string;
            title?: string;
            year?: number;
            torrents?: Array<{
              hash?: string;
              quality?: string;
              type?: string;
              size?: string;
              seeds?: number;
            }>;
          }>;
        };
      };
      const movie = data.data?.movies?.[0];
      if (!movie || !movie.torrents?.length) continue;

      const movieName = movie.title_long || `${movie.title || "Movie"} (${movie.year || ""})`.trim();
      const results: FormattedTorrent[] = [];
      movie.torrents.forEach((t, i) => {
        const hash = (t.hash || "").trim().toLowerCase();
        if (!hash || hash.length !== 40) return;
        const qRaw = t.quality || "HD";
        const quality = qRaw === "2160p" ? "4K" : qRaw;
        const seeds = t.seeds || 0;
        const size = t.size || "";
        const title = `${movieName} [${qRaw}] [${t.type || "BluRay"}] [YTS]`;
        const magnet = buildMagnet(hash, title);

        const labelParts = [`[${quality}]`, "YTS"];
        if (seeds > 0) labelParts.push(`• ${seeds} seeds`);
        if (size) labelParts.push(`(${size})`);

        results.push({
          id: `yts_${hash}_${i}`,
          name: labelParts.join(" "),
          title,
          infoHash: hash,
          magnet,
          quality,
          seeds,
          size,
          provider: "YTS",
        });
      });
      if (results.length > 0) return results;
    } catch {
      continue;
    }
  }
  return [];
}

// 4. Fetch direct EZTV API (for TV series)
async function fetchEztv(
  imdbId: string,
  season: number,
  episode: number,
  signal: AbortSignal
): Promise<FormattedTorrent[]> {
  const numericId = imdbId.replace(/^tt/i, "");
  if (!numericId) return [];

  const mirrors = ["eztvx.to", "eztv.re"];
  for (const domain of mirrors) {
    try {
      const url = `https://${domain}/api/get-torrents?imdb_id=${numericId}&limit=100`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        signal,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        torrents?: Array<{
          title?: string;
          hash?: string;
          season?: string | number;
          episode?: string | number;
          seeds?: number;
          size_bytes?: string | number;
          magnet_url?: string;
        }>;
      };
      const list = data.torrents || [];
      if (!list.length) continue;

      const matching = list.filter(
        (t) =>
          String(t.season) === String(season) &&
          String(t.episode) === String(episode)
      );
      if (!matching.length) continue;

      const results: FormattedTorrent[] = [];
      matching.forEach((t, i) => {
        const hash = (t.hash || "").trim().toLowerCase();
        if (!hash || hash.length !== 40) return;
        const title = (t.title || `Episode S${season}E${episode}`).trim();
        const seeds = t.seeds || 0;
        const sizeBytes = parseInt(String(t.size_bytes || 0), 10) || 0;
        let size = "";
        if (sizeBytes > 1024 * 1024 * 1024) {
          size = `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        } else if (sizeBytes > 1024 * 1024) {
          size = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
        }
        const quality = detectQuality(title);
        const magnet = t.magnet_url || buildMagnet(hash, title);

        const labelParts = [`[${quality}]`, "EZTV"];
        if (seeds > 0) labelParts.push(`• ${seeds} seeds`);
        if (size) labelParts.push(`(${size})`);

        results.push({
          id: `eztv_${hash}_${i}`,
          name: labelParts.join(" "),
          title,
          infoHash: hash,
          magnet,
          quality,
          seeds,
          size,
          provider: "EZTV",
        });
      });
      if (results.length > 0) return results;
    } catch {
      continue;
    }
  }
  return [];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const pathSegments = resolvedParams.path || [];

    const url = new URL(request.url);
    let type = pathSegments[0] || url.searchParams.get("type") || "movie";
    const id = pathSegments[1] || url.searchParams.get("id") || "";
    const season = parseInt(pathSegments[2] || url.searchParams.get("season") || "1", 10);
    const episode = parseInt(pathSegments[3] || url.searchParams.get("episode") || "1", 10);

    if (type === "anime") type = "tv";
    const isTv = type === "tv" || type === "series";

    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json({ success: false, error: "Invalid media ID" }, { status: 400 });
    }

    const cacheKey = `${type}_${id}_${season}_${episode}`;
    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      // O(1) LRU promotion: move accessed entry to the tail (MRU)
      CACHE.delete(cacheKey);
      CACHE.set(cacheKey, cached);
      return NextResponse.json({
        success: true,
        cached: true,
        imdbId: cached.imdbId,
        count: cached.data.length,
        torrents: cached.data,
      });
    }

    // Resolve IMDb ID, Title, and Year if not already given
    let imdbId = id.startsWith("tt") ? id : "";
    let mediaTitle = url.searchParams.get("title") || "";
    let mediaYear = url.searchParams.get("year") || "";

    if (!imdbId || !mediaTitle) {
      const bindings = await getCineCubBindings();
      const apiKey = (bindings.TMDB_API_KEY || process.env.TMDB_API_KEY || "").trim();
      if (apiKey) {
        const tmdbType = isTv ? "tv" : "movie";
        const tmdbUrl = `https://api.themoviedb.org/3/${tmdbType}/${encodeURIComponent(id)}?api_key=${encodeURIComponent(apiKey)}&append_to_response=external_ids`;

        try {
          const tmdbRes = await fetch(tmdbUrl, {
            headers: { Accept: "application/json" },
          });
          if (tmdbRes.ok) {
            const tmdbData = (await tmdbRes.json()) as {
              title?: string;
              name?: string;
              release_date?: string;
              first_air_date?: string;
              external_ids?: { imdb_id?: string };
            };
            if (!imdbId && tmdbData.external_ids?.imdb_id) {
              imdbId = tmdbData.external_ids.imdb_id;
            }
            if (!mediaTitle) {
              mediaTitle = tmdbData.title || tmdbData.name || "";
            }
            if (!mediaYear) {
              const relDate = tmdbData.release_date || tmdbData.first_air_date || "";
              mediaYear = relDate.slice(0, 4);
            }
          }
        } catch (err) {
          console.warn("[/api/torrents] TMDB fetch failed:", err);
        }
      }
    }

    if (!imdbId && !mediaTitle) {
      return NextResponse.json({
        success: false,
        error: "Media identifier not found for torrent lookup",
        torrents: [],
      });
    }

    // Parallel fetch across 30+ providers with 12s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const promises: Promise<FormattedTorrent[]>[] = [];

    const textQuery = isTv
      ? (mediaTitle
          ? (season === 0 ? `${mediaTitle} Special` : `${mediaTitle} S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`)
          : imdbId)
      : (mediaTitle ? `${mediaTitle} ${mediaYear}`.trim() : imdbId);

    if (imdbId) {
      promises.push(fetchTorrentio(isTv, imdbId, season, episode, controller.signal));
      promises.push(fetchApibay(isTv, imdbId, season, episode, controller.signal, textQuery));
    } else if (textQuery) {
      promises.push(fetchApibay(isTv, "", season, episode, controller.signal, textQuery));
    }

    if (textQuery) {
      promises.push(fetchBitsearch(textQuery, controller.signal));
      promises.push(fetchTorrentsCsv(textQuery, controller.signal));
    }

    if (mediaTitle) {
      const nyaaQuery = isTv
        ? (season === 0 ? `${mediaTitle} Special` : `${mediaTitle} E${episode}`)
        : mediaTitle;
      promises.push(fetchNyaa(nyaaQuery, controller.signal));
      promises.push(fetchAnimeTosho(nyaaQuery, controller.signal));

      // Extra title fallback for anime / long-running TV series that may be distributed in batches
      if (isTv && (season === 0 || episode > 50)) {
        promises.push(fetchApibay(isTv, "", season, episode, controller.signal, mediaTitle));
        promises.push(fetchBitsearch(`${mediaTitle} ${mediaYear || ""}`.trim(), controller.signal));
      }
    }

    if (!isTv && imdbId) {
      promises.push(fetchYts(imdbId, controller.signal));
    } else if (isTv && imdbId) {
      promises.push(fetchEztv(imdbId, season, episode, controller.signal));
    }

    const settled = await Promise.allSettled(promises);
    clearTimeout(timeout);

    const allStreams: FormattedTorrent[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled" && Array.isArray(result.value)) {
        allStreams.push(...result.value);
      }
    }

    // Deduplicate across providers by lowercase infoHash
    const dedupeMap = new Map<string, FormattedTorrent>();
    for (const stream of allStreams) {
      const key = stream.infoHash.toLowerCase();
      if (!key || key.length !== 40) continue;
      const existing = dedupeMap.get(key);
      if (!existing) {
        dedupeMap.set(key, { ...stream });
      } else {
        // Merge maximum seeders and size
        if (stream.seeds > existing.seeds) existing.seeds = stream.seeds;
        if (!existing.size && stream.size) existing.size = stream.size;
        if (
          (existing.provider === "Torrent" || existing.provider === "Multi-Indexer") &&
          stream.provider !== "Torrent" &&
          stream.provider !== "Multi-Indexer"
        ) {
          existing.provider = stream.provider;
        }
        // Re-generate formatted display name
        const labelParts = [`[${existing.quality}]`, existing.provider];
        if (existing.seeds > 0) labelParts.push(`• ${existing.seeds} seeds`);
        if (existing.size) labelParts.push(`(${existing.size})`);
        existing.name = labelParts.join(" ");
      }
    }

    // Intelligent Relevance Scoring to prevent multi-movie collection packs from outranking the actual title
    const titleNorm = (mediaTitle || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const titleTokens = titleNorm ? titleNorm.split(/\s+/).filter((t) => t.length > 2) : [];
    const yearStr = mediaYear ? String(mediaYear) : "";

    const scoreTorrent = (t: FormattedTorrent): number => {
      let score = 0;
      const rawText = `${t.title} ${t.filename || ""} ${t.name}`.toLowerCase();

      // 1. Heavy penalty for multi-movie collections/packs/bundles (apply heavily to movies)
      const isPack = /\b(pack|collection|complete\s*(movies|films|series|set)?|top\s*\d+|\d+\s*movies|anthology|trilogy|quadrilogy|bundle|gdrive|boxset)\b/i.test(rawText);
      if (isPack) {
        if (!isTv) {
          score -= 25000;
        } else if (season > 0) {
          score -= 5000;
        }
      }

      // 2. Title token matching
      if (titleTokens.length > 0) {
        let matchedTokens = 0;
        for (const tok of titleTokens) {
          if (rawText.includes(tok)) matchedTokens++;
        }
        if (matchedTokens === titleTokens.length) {
          score += 15000; // All key title words matched!
        } else {
          score += (matchedTokens / titleTokens.length) * 8000;
        }
      }

      // 3. Year match bonus
      if (yearStr && rawText.includes(yearStr)) {
        score += 5000;
      }

      // 4. TV Season & Episode match bonus
      if (isTv) {
        const sPad = String(season).padStart(2, "0");
        const ePad = String(episode).padStart(2, "0");
        const epRegex = new RegExp(`s0?${season}e0?${episode}|${season}x0?${episode}`, "i");
        if (epRegex.test(rawText)) {
          score += 12000;
        } else if (rawText.includes(`s${sPad}`) && rawText.includes(`e${ePad}`)) {
          score += 9000;
        } else if (rawText.includes(`s${sPad}`) || rawText.includes(`season ${season}`)) {
          score += 3000;
        }

        // Check if title has episode range matching current episode (e.g. 001-400 or 1-200)
        const rangeMatch = rawText.match(/(\d{1,4})\s*[-~_]\s*(\d{1,4})/);
        if (rangeMatch) {
          const startEp = parseInt(rangeMatch[1], 10);
          const endEp = parseInt(rangeMatch[2], 10);
          if (episode >= startEp && episode <= endEp) {
            score += 14000; // Contains the episode requested!
          }
        }
      }

      // 5. Quality scoring bonus
      if (/4k|2160p/i.test(t.quality || rawText)) score += 3000;
      else if (/1080p/i.test(t.quality || rawText)) score += 2500;
      else if (/720p/i.test(t.quality || rawText)) score += 1500;

      // 6. Trusted/verified providers bonus
      if (t.provider === "YTS" || t.provider === "1337x" || t.provider === "EZTV" || t.provider === "TorrentGalaxy") {
        score += 1000;
      }

      // 7. Seeds bonus (capped so a massive spam pack cannot outrank the real title)
      score += Math.min(t.seeds || 0, 1500);

      return score;
    };

    // Schwartzian Transform: precompute relevance score once per torrent in O(N) time
    // to eliminate repetitive regex evaluations in the O(N log N) sort comparator
    const formatted = Array.from(dedupeMap.values())
      .map((t) => ({ torrent: t, score: scoreTorrent(t), seeds: t.seeds || 0 }))
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        return b.seeds - a.seeds;
      })
      .map((item) => item.torrent);

    // Cache results (O(1) LRU eviction)
    if (formatted.length > 0) {
      CACHE.set(cacheKey, { data: formatted, ts: Date.now(), imdbId });
      if (CACHE.size > 200) {
        const oldest = CACHE.keys().next().value;
        if (oldest) CACHE.delete(oldest);
      }
    }

    return NextResponse.json({
      success: true,
      imdbId,
      count: formatted.length,
      torrents: formatted,
    });
  } catch (error) {
    console.error("[/api/torrents] Handler error:", error);
    return NextResponse.json(
      { success: false, error: "Internal error retrieving torrents", torrents: [] },
      { status: 500 }
    );
  }
}
