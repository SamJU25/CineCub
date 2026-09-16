import { NextRequest, NextResponse } from "next/server";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const HOST = "cinecub.stream";
const KEY = "c7b2a9d8e1f0435689ab012345cdef78";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const TMDB_KEY = process.env.TMDB_API_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    let urlList: string[] = Array.isArray(body?.urls) ? body.urls : [];

    // Filter to valid host URLs
    urlList = urlList
      .filter((u): u is string => typeof u === "string" && u.startsWith(`https://${HOST}`))
      .slice(0, 10000);

    if (urlList.length === 0) {
      return NextResponse.json(
        { error: `No valid https://${HOST} URLs provided in urls array` },
        { status: 400 }
      );
    }

    const payload = {
      host: HOST,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList,
    };

    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    return NextResponse.json({
      success: res.ok,
      status: res.status,
      submitted: urlList.length,
      message: res.ok ? "URLs submitted successfully to IndexNow" : text,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "IndexNow submission failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const coreRoutes = [
      `https://${HOST}/`,
      `https://${HOST}/?page=browse&cat=movie`,
      `https://${HOST}/?page=browse&cat=tv`,
      `https://${HOST}/?page=browse&cat=anime`,
      `https://${HOST}/?page=browse&cat=trending`,
      `https://${HOST}/?page=browse&cat=popular`,
      `https://${HOST}/?page=browse&cat=toprated`,
      `https://${HOST}/?page=browse&cat=upcoming`,
    ];

    const trendingUrls: string[] = [];
    try {
      const tmdbRes = await fetch(
        `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_KEY}`,
        { next: { revalidate: 3600 } }
      );
      if (tmdbRes.ok) {
        const data = await tmdbRes.json();
        if (Array.isArray(data?.results)) {
          for (const item of data.results.slice(0, 50)) {
            if (item?.id) {
              const type = item.media_type === "tv" || (!item.title && item.name) ? "tv" : "movie";
              trendingUrls.push(`https://${HOST}/?id=${item.id}&type=${type}`);
            }
          }
        }
      }
    } catch {
      // Non-blocking fallback
    }

    const urlList = Array.from(new Set([...coreRoutes, ...trendingUrls]));

    const payload = {
      host: HOST,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList,
    };

    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    return NextResponse.json({
      success: res.ok,
      status: res.status,
      submitted: urlList.length,
      message: res.ok ? "IndexNow pinged successfully" : text,
      urls: urlList,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "IndexNow ping failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
