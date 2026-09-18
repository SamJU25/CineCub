import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";
import { hashPassword, signJWT } from "@/lib/auth-crypto";

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

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getAuthCorsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const authCors = getAuthCorsHeaders(request);

  try {
    const body = await request.json().catch(() => ({}));
    const token = (body.token || "").trim();
    const newPassword = body.newPassword || "";
    const confirmPassword = body.confirmPassword || "";

    if (!token) {
      return NextResponse.json(
        { success: false, error: "MISSING_TOKEN", message: "Password reset token is missing." },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: "WEAK_PASSWORD", message: "Password must be at least 8 characters long." },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "PASSWORDS_DO_NOT_MATCH", message: "Passwords do not match." },
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

    // Look up user by reset token
    const user = await bindings.DB.prepare(
      "SELECT id, username, email, display_name, photo_url, reset_token_expires FROM users WHERE reset_token = ? LIMIT 1"
    )
      .bind(token)
      .first<{
        id: string;
        username: string;
        email: string;
        display_name: string;
        photo_url: string;
        reset_token_expires: number;
      }>();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_TOKEN",
          message: "This password reset link is invalid or has already been used.",
        },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    // Check expiration
    if (user.reset_token_expires && user.reset_token_expires < Date.now()) {
      return NextResponse.json(
        {
          success: false,
          error: "EXPIRED_TOKEN",
          message: "This password reset link has expired. Please request a new one.",
        },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    // Hash the new password with Web Crypto PBKDF2
    const passwordHash = await hashPassword(newPassword);
    const now = Date.now();

    // Update password, clear reset tokens, and mark email as verified
    await bindings.DB.prepare(
      "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, email_verified = 1, updated_at = ? WHERE id = ?"
    )
      .bind(passwordHash, now, user.id)
      .run();

    // Issue JWT so the user is immediately logged in
    const jwtPayload = {
      uid: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      photoURL: user.photo_url || "/assets/avatars/av_1.png",
    };

    const tokenJwt = await signJWT(jwtPayload, bindings.JWT_SECRET);

    return NextResponse.json(
      {
        success: true,
        message: "Your password has been reset successfully!",
        user: {
          ...jwtPayload,
          hasPassword: true,
          emailVerified: true,
          idToken: tokenJwt,
          refreshToken: tokenJwt,
        },
      },
      { status: 200, headers: { "Content-Type": "application/json", ...authCors } }
    );
  } catch (err: unknown) {
    console.error("[Reset Password Error]", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      { success: false, error: "SERVER_ERROR", message },
      { status: 500, headers: { "Content-Type": "application/json", ...authCors } }
    );
  }
}
