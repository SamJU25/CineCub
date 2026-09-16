import { NextRequest, NextResponse } from "next/server";
import { resolveImdbId, searchOpenSubtitles, searchSubDL, SubtitleEntry } from "@/lib/subtitles";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("Origin") || "*";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("Origin") || "*";
  const resHeaders = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
  });

  try {
    const url = request.nextUrl;
    const tmdbId = url.searchParams.get("tmdb_id") || "";
    const mediaType = (url.searchParams.get("type") || "movie").toLowerCase() as "movie" | "tv";
    const season = parseInt(url.searchParams.get("season") || "1", 10);
    const episode = parseInt(url.searchParams.get("episode") || "1", 10);
    const lang = (url.searchParams.get("lang") || "EN").toUpperCase();

    if (!tmdbId) {
      return new NextResponse(
        JSON.stringify({ status: false, found: false, count: 0, entries: [] }),
        { status: 200, headers: resHeaders }
      );
    }

    // Run SubDL and OpenSubtitles concurrently at the edge (no Render dependency)
    const subdlPromise = searchSubDL(tmdbId, mediaType, season, episode, lang).catch(() => []);

    const osPromise = (async () => {
      const imdbId = await resolveImdbId(tmdbId, mediaType);
      if (!imdbId) return [];
      return searchOpenSubtitles(imdbId, mediaType, season, episode, lang);
    })().catch(() => []);

    const [subdlEntries, osEntries] = await Promise.all([subdlPromise, osPromise]);

    const combined: SubtitleEntry[] = [];
    const seenNames = new Set<string>();

    // Prioritize SubDL entries
    for (const sub of subdlEntries) {
      const key = sub.name.toLowerCase().trim();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        combined.push(sub);
      }
    }

    // Append non-duplicate OpenSubtitles entries
    for (const os of osEntries) {
      const key = os.name.toLowerCase().trim();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        combined.push(os);
      }
    }

    if (combined.length > 0) {
      return new NextResponse(
        JSON.stringify({
          status: true,
          found: true,
          count: combined.length,
          entries: combined,
          provider: subdlEntries.length > 0 && osEntries.length > 0
            ? "SubDL + OpenSubtitles"
            : subdlEntries.length > 0
            ? "SubDL"
            : "OpenSubtitles",
        }),
        { status: 200, headers: resHeaders }
      );
    }

    return new NextResponse(
      JSON.stringify({ status: false, found: false, count: 0, entries: [] }),
      { status: 200, headers: resHeaders }
    );
  } catch (globalErr: unknown) {
    const message = globalErr instanceof Error ? globalErr.message : String(globalErr);
    return new NextResponse(
      JSON.stringify({
        error: "SUBTITLE_GATEWAY_ERROR",
        details: message,
      }),
      { status: 500, headers: resHeaders }
    );
  }
}
