import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";
import { verifyPassword, signJWT } from "@/lib/auth-crypto";

const ALLOWED_AUTH_ORIGINS = new Set([
  "https://cinecub.stream",
  "https://www.cinecub.stream",
  "http://localhost:3000",
  "http://localhost:4321",
  "http://localhost:5173",
  "http://localhost:8787",
]);

function getAuthCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (ALLOWED_AUTH_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const IP_LIMITS = new Map<string, RateLimitRecord>();

function checkRateLimit(
  map: Map<string, RateLimitRecord>,
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  if (map.size > 5000) {
    for (const [k, v] of map.entries()) {
      if (now > v.resetAt) map.delete(k);
    }
  }

  const record = map.get(key);

  if (!record || now > record.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (record.count >= limit) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  return { allowed: true, retryAfter: 0 };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getAuthCorsHeaders(request) });
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  photo_url: string;
  email_verified: number;
}

export async function POST(request: NextRequest) {
  const authCors = getAuthCorsHeaders(request);

  try {
    const rawFwd = request.headers.get("x-forwarded-for") || "";
    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      (rawFwd ? rawFwd.split(",")[0].trim() : "") ||
      "unknown-ip";
    const ipCheck = checkRateLimit(IP_LIMITS, clientIp, 10, 15 * 60 * 1000);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "RATE_LIMIT_EXCEEDED",
          message: `Too many login attempts. Try again in ${ipCheck.retryAfter}s.`,
        },
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(ipCheck.retryAfter),
            ...authCors,
          },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const credential = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!credential) {
      return NextResponse.json(
        { success: false, error: "MISSING_CREDENTIAL", message: "Please provide an email or username." },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    if (!password) {
      return NextResponse.json(
        { success: false, error: "MISSING_PASSWORD", message: "Please enter your password." },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    const bindings = await getCineCubBindings();
    if (!bindings.DB) {
      return NextResponse.json(
        { success: false, error: "DB_UNAVAILABLE", message: "Database service unavailable." },
        { status: 503, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    // Lookup user in Cloudflare D1 by email or username
    const user = await bindings.DB.prepare(
      `SELECT id, username, email, password_hash, display_name, photo_url, email_verified
       FROM users
       WHERE email = ? OR username = ?
       LIMIT 1`
    )
      .bind(credential, credential)
      .first<UserRow>();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "ACCOUNT_NOT_FOUND", message: "No account found with this email or username." },
        { status: 401, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    // Verify password hash
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "INVALID_PASSWORD", message: "Incorrect password. Please try again." },
        { status: 401, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    // Sign JWT token
    const idToken = await signJWT(
      {
        uid: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        photoURL: user.photo_url || "/assets/avatars/av_1.png",
      },
      bindings.JWT_SECRET
    );

    return NextResponse.json(
      {
        success: true,
        user: {
          uid: user.id,
          email: user.email,
          displayName: user.display_name,
          username: user.username,
          photoURL: user.photo_url || "/assets/avatars/av_1.png",
          idToken,
          refreshToken: idToken,
        },
      },
      { status: 200, headers: { "Content-Type": "application/json", ...authCors } }
    );
  } catch (err: unknown) {
    console.error("[Login Error]", err);
    return NextResponse.json(
      { success: false, error: "SERVER_ERROR", message: "An unexpected error occurred. Please try again." },
      { status: 500, headers: { "Content-Type": "application/json", ...authCors } }
    );
  }
}
