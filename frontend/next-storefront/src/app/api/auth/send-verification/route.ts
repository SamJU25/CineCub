import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";
import { verifyJWT } from "@/lib/auth-crypto";
import { sendVerificationEmail } from "@/lib/email";

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
    const ipCheck = checkRateLimit(IP_LIMITS, clientIp, 3, 10 * 60 * 1000);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "RATE_LIMIT_EXCEEDED",
          message: `Too many verification requests. Try again in ${ipCheck.retryAfter}s.`,
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

    const authHeader = request.headers.get("Authorization") || "";
    const tokenFromHeader = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const body = await request.json().catch(() => ({}));
    const token = tokenFromHeader || body.idToken || "";

    const bindings = await getCineCubBindings();
    const user = await verifyJWT(token, bindings.JWT_SECRET);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED", message: "Invalid or expired session." },
        { status: 401, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    if (!bindings.DB) {
      return NextResponse.json(
        { success: false, error: "DB_UNAVAILABLE", message: "Database service unavailable." },
        { status: 503, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    const row = await bindings.DB.prepare(
      "SELECT email_verified, email, username, display_name FROM users WHERE id = ? LIMIT 1"
    )
      .bind(user.uid)
      .first<{ email_verified: number; email: string; username: string; display_name: string }>();

    if (row && row.email_verified) {
      return NextResponse.json(
        { success: true, message: "Your email address is already verified." },
        { status: 200, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    const verificationToken = crypto.randomUUID();
    const now = Date.now();

    await bindings.DB.prepare(
      "UPDATE users SET verification_token = ?, updated_at = ? WHERE id = ?"
    )
      .bind(verificationToken, now, user.uid)
      .run();

    const reqOrigin = request.headers.get("origin") || "";
    const origin = ALLOWED_AUTH_ORIGINS.has(reqOrigin) ? reqOrigin : "https://cinecub.stream";
    await sendVerificationEmail({
      to: user.email,
      token: verificationToken,
      username: user.username || user.displayName,
      origin,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Verification email sent successfully.",
      },
      { status: 200, headers: { "Content-Type": "application/json", ...authCors } }
    );
  } catch (err: unknown) {
    console.error("[Send Verification Error]", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      { success: false, error: "SERVER_ERROR", message },
      { status: 500, headers: { "Content-Type": "application/json", ...authCors } }
    );
  }
}
