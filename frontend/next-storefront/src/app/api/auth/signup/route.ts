import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";
import { hashPassword, signJWT } from "@/lib/auth-crypto";
import type { CloudBundle } from "@/lib/types";

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

export async function POST(request: NextRequest) {
  const authCors = getAuthCorsHeaders(request);

  try {
    const rawFwd = request.headers.get("x-forwarded-for") || "";
    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      (rawFwd ? rawFwd.split(",")[0].trim() : "") ||
      "unknown-ip";
    const ipCheck = checkRateLimit(IP_LIMITS, clientIp, 5, 15 * 60 * 1000);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "RATE_LIMIT_EXCEEDED",
          message: `Too many requests. Try again in ${ipCheck.retryAfter}s.`,
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
    const rawName = (body.name || "").trim();
    const name = rawName.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
    const username = (body.username || "").trim().toLowerCase();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!name) {
      return NextResponse.json(
        { success: false, error: "MISSING_NAME", message: "Please enter your name." },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    if (!username || username.length < 3 || username.length > 20) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_USERNAME",
          message: "Username must be between 3 and 20 characters.",
        },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_USERNAME",
          message: "Username can only contain letters, numbers, and underscores.",
        },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "INVALID_EMAIL", message: "Please provide a valid email address." },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: "WEAK_PASSWORD", message: "Password must be at least 6 characters." },
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

    // 1. Check for existing email
    const existingEmail = await bindings.DB.prepare(
      "SELECT id FROM users WHERE email = ? LIMIT 1"
    )
      .bind(email)
      .first();

    if (existingEmail) {
      return NextResponse.json(
        { success: false, error: "EMAIL_EXISTS", message: "An account with this email already exists." },
        { status: 409, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    // 2. Check for existing username
    const existingUsername = await bindings.DB.prepare(
      "SELECT id FROM users WHERE username = ? LIMIT 1"
    )
      .bind(username)
      .first();

    if (existingUsername) {
      return NextResponse.json(
        { success: false, error: "USERNAME_TAKEN", message: "This username is already taken." },
        { status: 409, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    // 3. Hash password using WebCrypto PBKDF2
    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const now = Date.now();
    const photoUrl = "/assets/avatars/av_1.png";

    // 4. Insert into Cloudflare D1
    await bindings.DB.prepare(
      `INSERT INTO users (id, username, email, password_hash, display_name, photo_url, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
    )
      .bind(userId, username, email, passwordHash, name, photoUrl, now, now)
      .run();

    // 5. Initialize user library in Cloudflare R2
    if (bindings.STORAGE) {
      const initialBundle: CloudBundle = { watchlist: [], history: [], progress: {} };
      await bindings.STORAGE.put(`users/${userId}/library.json`, JSON.stringify(initialBundle), {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { userId, createdAt: String(now) },
      }).catch((e: unknown) => console.warn("[R2 Init Storage Warning]", e));
    }

    // 6. Sign JWT token
    const idToken = await signJWT(
      {
        uid: userId,
        email,
        username,
        displayName: name,
        photoURL: photoUrl,
      },
      bindings.JWT_SECRET
    );

    return NextResponse.json(
      {
        success: true,
        verificationEmailSent: false,
        user: {
          uid: userId,
          email,
          displayName: name,
          username,
          photoURL: photoUrl,
          idToken,
          refreshToken: idToken,
        },
      },
      { status: 201, headers: { "Content-Type": "application/json", ...authCors } }
    );
  } catch (err: unknown) {
    console.error("[Signup Error]", err);
    return NextResponse.json(
      { success: false, error: "SERVER_ERROR", message: "An unexpected error occurred. Please try again." },
      { status: 500, headers: { "Content-Type": "application/json", ...authCors } }
    );
  }
}
