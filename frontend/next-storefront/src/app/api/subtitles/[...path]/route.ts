import { NextRequest, NextResponse } from "next/server";
import { convertSrtToVtt } from "@/lib/subtitles";

const SAFE_PATH_RE = /^[A-Za-z0-9_./-]+$/;

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("Origin") || "*";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  const subPath = path ? `/${path.join("/")}` : "";

  if (subPath && !SAFE_PATH_RE.test(subPath)) {
    return NextResponse.json({ error: "INVALID_SUBTITLE_PATH" }, {
      status: 400,
      headers: { "Access-Control-Allow-Origin": origin },
    });
  }

  if (subPath === "/download") {
    const url = request.nextUrl;
    const fileRef = url.searchParams.get("file") || "";

    // 1. SubDL Subtitle Download (Edge-Native)
    if (fileRef.startsWith("subdl_")) {
      try {
        const b64 = fileRef.slice(6).replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "===".slice((b64.length + 3) % 4);
        const rawRef = atob(padded);

        if (!/^[A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_\-]+)?(?:\.[A-Za-z0-9]{2,4})?$/.test(rawRef)) {
          return NextResponse.json({ error: "INVALID_SUBDL_REF" }, {
            status: 400,
            headers: { "Access-Control-Allow-Origin": origin },
          });
        }

        const apiKey = process.env.SUBDL_API_KEY || "";
        if (!apiKey) {
          return NextResponse.json({ error: "SUBDL_NOT_CONFIGURED" }, {
            status: 503,
            headers: { "Access-Control-Allow-Origin": origin },
          });
        }
        const subRes = await fetch(`https://dl.subdl.com/subtitle/${rawRef}`, {
          headers: {
            "x-api-key": apiKey,
            "User-Agent": "CineCub-Storefront/1.0",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!subRes.ok) {
          throw new Error(`SubDL download failed with HTTP ${subRes.status}`);
        }

        const rawText = await subRes.text();
        const vtt = convertSrtToVtt(rawText);

        return new NextResponse(vtt, {
          status: 200,
          headers: {
            "Content-Type": "text/vtt; charset=utf-8",
            "Access-Control-Allow-Origin": origin,
            "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
            "X-Subtitle-Source": "SubDL-Edge",
          },
        });
      } catch (err: unknown) {
        console.warn("[subtitles] SubDL download failed:", err);
        return NextResponse.json(
          { error: "SUBDL_DOWNLOAD_FAILED", details: String(err) },
          { status: 502, headers: { "Access-Control-Allow-Origin": origin } }
        );
      }
    }

    // 2. OpenSubtitles Subtitle Download (Edge-Native)
    if (fileRef.startsWith("os_")) {
      try {
        const b64 = fileRef.slice(3).replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "===".slice((b64.length + 3) % 4);
        const sourceUrl = atob(padded);

        let parsedSource: URL;
        try {
          parsedSource = new URL(sourceUrl);
        } catch {
          return NextResponse.json({ error: "INVALID_SUBTITLE_URL" }, {
            status: 400,
            headers: { "Access-Control-Allow-Origin": origin },
          });
        }

        const host = parsedSource.hostname.toLowerCase();
        const isTrustedHost =
          parsedSource.protocol === "https:" &&
          (host === "subs5.strem.io" ||
           host === "opensubtitles.org" ||
           host.endsWith(".opensubtitles.org") ||
           host === "opensubtitles.com" ||
           host.endsWith(".opensubtitles.com"));

        if (!isTrustedHost) {
          return NextResponse.json({ error: "UNTRUSTED_SUBTITLE_SOURCE" }, {
            status: 400,
            headers: { "Access-Control-Allow-Origin": origin },
          });
        }

        const subRes = await fetch(sourceUrl, {
          headers: { "User-Agent": "CineCub-Storefront/1.0" },
          signal: AbortSignal.timeout(10000),
        });

        if (!subRes.ok) {
          throw new Error(`OpenSubtitles download failed with HTTP ${subRes.status}`);
        }

        const rawText = await subRes.text();
        const vtt = convertSrtToVtt(rawText);

        return new NextResponse(vtt, {
          status: 200,
          headers: {
            "Content-Type": "text/vtt; charset=utf-8",
            "Access-Control-Allow-Origin": origin,
            "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
            "X-Subtitle-Source": "OpenSubtitles-Edge",
          },
        });
      } catch (err: unknown) {
        console.warn("[subtitles] OpenSubtitles download failed:", err);
        return NextResponse.json(
          { error: "OS_DOWNLOAD_FAILED", details: String(err) },
          { status: 502, headers: { "Access-Control-Allow-Origin": origin } }
        );
      }
    }

    return NextResponse.json(
      { error: "INVALID_SUBTITLE_REF" },
      { status: 400, headers: { "Access-Control-Allow-Origin": origin } }
    );
  }

  return NextResponse.json(
    { error: "SUBTITLE_ENDPOINT_NOT_FOUND" },
    { status: 404, headers: { "Access-Control-Allow-Origin": origin } }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const origin = request.headers.get("Origin") || "*";
  const { path } = await params;
  const subPath = path ? `/${path.join("/")}` : "";

  if (subPath && !SAFE_PATH_RE.test(subPath)) {
    return NextResponse.json({ error: "INVALID_SUBTITLE_PATH" }, {
      status: 400,
      headers: { "Access-Control-Allow-Origin": origin },
    });
  }

  if (subPath === "/ai") {
    try {
      const { transcribeWithWhisper } = await import("@/lib/subtitles");
      const audioBuffer = await request.arrayBuffer();
      if (!audioBuffer || audioBuffer.byteLength === 0) {
        return NextResponse.json({ error: "EMPTY_AUDIO_PAYLOAD" }, {
          status: 400,
          headers: { "Access-Control-Allow-Origin": origin },
        });
      }

      const ai = (globalThis as unknown as { AI?: Parameters<typeof transcribeWithWhisper>[0] }).AI;
      if (ai) {
        const vtt = await transcribeWithWhisper(ai, audioBuffer);
        return new NextResponse(vtt, {
          status: 200,
          headers: {
            "Content-Type": "text/vtt; charset=utf-8",
            "Access-Control-Allow-Origin": origin,
            "X-Subtitle-Source": "Cloudflare-Workers-AI-Whisper",
          },
        });
      }
    } catch (aiErr) {
      console.warn("[subtitles] Cloudflare Workers AI Whisper failed:", aiErr);
    }
    return NextResponse.json(
      { error: "AI_TRANSCRIPTION_UNAVAILABLE" },
      { status: 503, headers: { "Access-Control-Allow-Origin": origin } }
    );
  }

  return NextResponse.json(
    { error: "NOT_FOUND" },
    { status: 404, headers: { "Access-Control-Allow-Origin": origin } }
  );
}
