import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";
import { sendPasswordResetEmail } from "@/lib/email";

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
const EMAIL_LIMITS = new Map<string, RateLimitRecord>();

function checkRateLimit(
  map: Map<string, RateLimitRecord>,
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
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
    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for") ||
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
    const email = (body.email || "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "INVALID_EMAIL", message: "Please provide a valid email address." },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    const emailCheck = checkRateLimit(EMAIL_LIMITS, email, 2, 5 * 60 * 1000);
    if (!emailCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "RATE_LIMIT_EXCEEDED",
          message: `Too many attempts. Try again in ${emailCheck.retryAfter}s.`,
        },
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(emailCheck.retryAfter),
            ...authCors,
          },
        }
      );
    }

    const bindings = await getCineCubBindings();
    if (bindings.DB) {
      const user = await bindings.DB.prepare(
        "SELECT id, username, display_name FROM users WHERE email = ? LIMIT 1"
      )
        .bind(email)
        .first<{ id: string; username: string; display_name: string }>();

      if (user) {
        const resetToken = crypto.randomUUID();
        const now = Date.now();
        const expires = now + 60 * 60 * 1000; // 1 hour

        await bindings.DB.prepare(
          "UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = ? WHERE id = ?"
        )
          .bind(resetToken, expires, now, user.id)
          .run();

        const reqOrigin = request.headers.get("origin") || "";
        const origin = ALLOWED_AUTH_ORIGINS.has(reqOrigin) ? reqOrigin : "https://cinecub.stream";
        await sendPasswordResetEmail({
          to: email,
          token: resetToken,
          username: user.display_name || user.username,
          origin,
        });
      }
    }

    // Always return success to prevent email enumeration
    return NextResponse.json(
      { success: true, message: "If an account exists, a link has been sent." },
      { status: 200, headers: { "Content-Type": "application/json", ...authCors } }
    );
  } catch (err: unknown) {
    console.error("[Forgot Password Error]", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      { success: false, error: "SERVER_ERROR", message },
      { status: 500, headers: { "Content-Type": "application/json", ...authCors } }
    );
  }
}
