import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";

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
  return new NextResponse(null, { status: 204, headers: getAuthCorsHeaders(request) });
}

async function handleVerification(request: NextRequest, token: string) {
  const authCors = getAuthCorsHeaders(request);

  if (!token) {
    return NextResponse.json(
      { success: false, error: "MISSING_TOKEN", message: "Verification token is missing." },
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

  const user = await bindings.DB.prepare(
    "SELECT id, email, username FROM users WHERE verification_token = ? LIMIT 1"
  )
    .bind(token)
    .first<{ id: string; email: string; username: string }>();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_TOKEN",
        message: "This verification link is invalid or has already been used.",
      },
      { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
    );
  }

  const now = Date.now();
  await bindings.DB.prepare(
    "UPDATE users SET email_verified = 1, verification_token = NULL, updated_at = ? WHERE id = ?"
  )
    .bind(now, user.id)
    .run();

  return NextResponse.json(
    {
      success: true,
      message: "Your email address has been verified successfully!",
      email: user.email,
    },
    { status: 200, headers: { "Content-Type": "application/json", ...authCors } }
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  return await handleVerification(request, token);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = body.token || request.nextUrl.searchParams.get("token") || "";
  return await handleVerification(request, token);
}
