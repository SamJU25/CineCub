import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const username = (url.searchParams.get("username") || "").trim().toLowerCase();

  if (!username || username.length < 3 || username.length > 20) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }

  const RESERVED = new Set([
    "admin",
    "root",
    "superuser",
    "moderator",
    "support",
    "help",
    "streamheaven",
    "cinecub",
    "system",
    "null",
    "undefined",
  ]);
  if (RESERVED.has(username)) {
    return NextResponse.json({ available: false, reason: "reserved" });
  }

  const bindings = await getCineCubBindings();
  if (bindings.DB) {
    try {
      const existing = await bindings.DB.prepare(
        "SELECT id FROM users WHERE username = ? LIMIT 1"
      )
        .bind(username)
        .first();

      if (existing) {
        return NextResponse.json({ available: false, reason: "taken" });
      }
    } catch (e) {
      console.warn("[Check Username DB error]", e);
    }
  }

  return NextResponse.json({ available: true });
}
