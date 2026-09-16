import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";
import { verifyJWT } from "@/lib/auth-crypto";
import type { CloudBundle } from "@/lib/types";

const ALLOWED_AUTH_ORIGINS = new Set([
  "https://cinecub.stream",
  "https://www.cinecub.stream",
  "http://localhost:3000",
  "http://localhost:4321",
  "http://localhost:5173",
  "http://localhost:8787",
]);

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (ALLOWED_AUTH_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

async function authenticate(request: NextRequest, jwtSecret?: string) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return verifyJWT(token, jwtSecret);
}

// GET: Fetch user library sync data from Cloudflare R2
export async function GET(request: NextRequest) {
  const cors = getCorsHeaders(request);
  const bindings = await getCineCubBindings();
  const user = await authenticate(request, bindings.JWT_SECRET);

  if (!user) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "Authentication required" },
      { status: 401, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  if (!bindings.STORAGE) {
    return NextResponse.json(
      { success: false, error: "STORAGE_UNAVAILABLE", message: "R2 storage binding unavailable" },
      { status: 503, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  try {
    const key = `users/${user.uid}/library.json`;
    const object = await bindings.STORAGE.get(key);

    if (!object) {
      const emptyBundle: CloudBundle = { watchlist: [], history: [], progress: {} };
      return NextResponse.json(
        { success: true, data: emptyBundle },
        { status: 200, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    const text = await object.text();
    const data = JSON.parse(text) as CloudBundle;
    if (!data.updatedAt) {
      const metaUpdated = object.customMetadata?.updatedAt;
      if (metaUpdated) data.updatedAt = Number(metaUpdated);
    }

    return NextResponse.json(
      { success: true, data },
      { status: 200, headers: { "Content-Type": "application/json", ...cors } }
    );
  } catch (err: unknown) {
    console.error("[R2 Sync GET Error]", err);
    const message = err instanceof Error ? err.message : "Failed to load library data";
    return NextResponse.json(
      { success: false, error: "FETCH_FAILED", message },
      { status: 500, headers: { "Content-Type": "application/json", ...cors } }
    );
  }
}

// POST: Save user library sync data to Cloudflare R2
export async function POST(request: NextRequest) {
  const cors = getCorsHeaders(request);
  const bindings = await getCineCubBindings();
  const user = await authenticate(request, bindings.JWT_SECRET);

  if (!user) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "Authentication required" },
      { status: 401, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  if (!bindings.STORAGE) {
    return NextResponse.json(
      { success: false, error: "STORAGE_UNAVAILABLE", message: "R2 storage binding unavailable" },
      { status: 503, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<CloudBundle>;
    const updatedAt = typeof body.updatedAt === "number" ? body.updatedAt : Date.now();
    const bundle: CloudBundle = {
      watchlist: Array.isArray(body.watchlist) ? body.watchlist : [],
      history: Array.isArray(body.history) ? body.history : [],
      progress: body.progress && typeof body.progress === "object" ? body.progress : {},
      ...(typeof body.avatar === "string" ? { avatar: body.avatar } : {}),
      updatedAt,
    };

    const key = `users/${user.uid}/library.json`;
    await bindings.STORAGE.put(key, JSON.stringify(bundle), {
      httpMetadata: {
        contentType: "application/json",
      },
      customMetadata: {
        userId: user.uid,
        updatedAt: String(updatedAt),
      },
    });

    return NextResponse.json(
      { success: true, message: "Library synced to Cloudflare R2 successfully" },
      { status: 200, headers: { "Content-Type": "application/json", ...cors } }
    );
  } catch (err: unknown) {
    console.error("[R2 Sync POST Error]", err);
    const message = err instanceof Error ? err.message : "Failed to save library data";
    return NextResponse.json(
      { success: false, error: "SAVE_FAILED", message },
      { status: 500, headers: { "Content-Type": "application/json", ...cors } }
    );
  }
}
