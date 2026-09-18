import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings, type CineCubBindings } from "@/lib/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import type { CloudBundle } from "@/lib/types";
import { signJWT } from "@/lib/auth-crypto";

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

interface GoogleUserData {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
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

// Generate a clean, URL-safe and unique username from name or email
async function generateUniqueUsername(
  db: D1Database,
  preferredName: string,
  email: string
): Promise<string> {
  let base = (preferredName || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (!base || base.length < 3) {
    base = (email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_");
  }
  if (!base || base.length < 3) {
    base = "user";
  }
  if (base.length > 12) {
    base = base.slice(0, 12);
  }

  let username = base;
  let counter = 1;

  while (true) {
    const existing = await db
      .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
      .bind(username)
      .first();

    if (!existing) {
      return username;
    }

    username = `${base}${counter}`;
    counter++;
  }
}

export async function POST(request: NextRequest) {
  const authCors = getAuthCorsHeaders(request);

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Collect any candidate tokens provided across different client wrappers
    const rawTokens = [
      typeof body.credential === "string" ? body.credential.trim() : "",
      typeof body.idToken === "string" ? body.idToken.trim() : "",
      typeof body.accessToken === "string" ? body.accessToken.trim() : "",
      typeof body.token === "string" ? body.token.trim() : "",
    ].filter(Boolean);

    const candidateTokens = Array.from(new Set(rawTokens));

    if (candidateTokens.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "MISSING_TOKEN",
          message: "Google credential or access token is required.",
        },
        { status: 400, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    let googleUser: GoogleUserData | null = null;

    // Polymorphic Token Verification: handles ID Tokens (JWT), Access Tokens, and One-Tap
    for (const token of candidateTokens) {
      const isJwt = token.startsWith("ey") && token.includes(".");

      // Strategy A: If it looks like a JWT, verify via Google tokeninfo?id_token=
      if (isJwt) {
        try {
          const resp = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
            { headers: { "User-Agent": "CineCub-Auth/1.0" } }
          );
          if (resp.ok) {
            const data = (await resp.json()) as Record<string, any>;
            if (data.email && data.sub) {
              googleUser = {
                sub: String(data.sub),
                email: String(data.email).toLowerCase().trim(),
                name: String(data.name || data.given_name || String(data.email).split("@")[0]),
                picture: data.picture ? String(data.picture) : undefined,
                given_name: data.given_name ? String(data.given_name) : undefined,
                family_name: data.family_name ? String(data.family_name) : undefined,
              };
              break;
            }
          }
        } catch (err) {
          console.warn("[Google Auth] id_token verification failed:", err);
        }
      }

      // Strategy B: Verify OAuth2 Access Token via Google userinfo endpoint
      try {
        const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": "CineCub-Auth/1.0",
          },
        });
        if (resp.ok) {
          const data = (await resp.json()) as Record<string, any>;
          if (data.email && data.sub) {
            googleUser = {
              sub: String(data.sub),
              email: String(data.email).toLowerCase().trim(),
              name: String(data.name || data.given_name || String(data.email).split("@")[0]),
              picture: data.picture ? String(data.picture) : undefined,
              given_name: data.given_name ? String(data.given_name) : undefined,
              family_name: data.family_name ? String(data.family_name) : undefined,
            };
            break;
          }
        }
      } catch (err) {
        console.warn("[Google Auth] userinfo verification failed:", err);
      }

      // Strategy C: Verify Access Token via tokeninfo?access_token=
      try {
        const resp = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
          { headers: { "User-Agent": "CineCub-Auth/1.0" } }
        );
        if (resp.ok) {
          const data = (await resp.json()) as Record<string, any>;
          if (data.email && (data.sub || data.user_id)) {
            const sub = String(data.sub || data.user_id);
            const email = String(data.email).toLowerCase().trim();
            googleUser = {
              sub,
              email,
              name: email.split("@")[0],
            };
            break;
          }
        }
      } catch (err) {
        console.warn("[Google Auth] tokeninfo access_token verification failed:", err);
      }

      // Strategy D: If not initially recognized as JWT, try id_token as fallback
      if (!isJwt) {
        try {
          const resp = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
            { headers: { "User-Agent": "CineCub-Auth/1.0" } }
          );
          if (resp.ok) {
            const data = (await resp.json()) as Record<string, any>;
            if (data.email && data.sub) {
              googleUser = {
                sub: String(data.sub),
                email: String(data.email).toLowerCase().trim(),
                name: String(data.name || data.given_name || String(data.email).split("@")[0]),
                picture: data.picture ? String(data.picture) : undefined,
                given_name: data.given_name ? String(data.given_name) : undefined,
                family_name: data.family_name ? String(data.family_name) : undefined,
              };
              break;
            }
          }
        } catch (err) {
          console.warn("[Google Auth] fallback id_token verification failed:", err);
        }
      }
    }

    if (!googleUser || !googleUser.email) {
      console.warn("[Google Auth] Token verification failed: No valid Google user profile extracted.");
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_GOOGLE_TOKEN",
          message: "Unable to verify Google account details. Please try again.",
        },
        { status: 401, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    const bindings = await getCineCubBindings();
    if (!bindings.DB) {
      console.error("[Google Auth] Cloudflare D1 DB binding is unavailable!");
      return NextResponse.json(
        { success: false, error: "DB_UNAVAILABLE", message: "Database service unavailable." },
        { status: 503, headers: { "Content-Type": "application/json", ...authCors } }
      );
    }

    const now = Date.now();

    // 3. Lookup existing account by email (Account Linking)
    const existingUser = await bindings.DB.prepare(
      `SELECT id, username, email, password_hash, display_name, photo_url, email_verified
       FROM users
       WHERE email = ?
       LIMIT 1`
    )
      .bind(googleUser.email)
      .first<UserRow>();

    let finalUserId: string;
    let finalUsername: string;
    let finalDisplayName: string;
    let finalPhotoUrl: string;
    let hasPassword: boolean;
    let isNewUser = false;

    if (existingUser) {
      // User exists! Link Google and ensure email is verified
      finalUserId = existingUser.id;
      finalUsername = existingUser.username;
      finalDisplayName = existingUser.display_name || googleUser.name;
      // Preserve CineCub avatar or reset to default CineCub avatar (never Gmail profile pic)
      finalPhotoUrl =
        existingUser.photo_url && !existingUser.photo_url.includes("googleusercontent.com")
          ? existingUser.photo_url
          : "/assets/avatars/av_1.png";
      hasPassword = !existingUser.password_hash.startsWith("google:");

      console.log(`[Google Auth] Linking existing user: ${finalUsername} (${finalUserId}), email: ${googleUser.email}`);

      // Update email_verified to 1, sanitize avatar, update timestamp
      await bindings.DB.prepare(
        `UPDATE users
         SET email_verified = 1,
             photo_url = ?,
             updated_at = ?
         WHERE id = ?`
      )
        .bind(finalPhotoUrl, now, finalUserId)
        .run();
    } else {
      // New user! Create user account in Cloudflare D1
      isNewUser = true;
      finalUserId = crypto.randomUUID();
      finalUsername = await generateUniqueUsername(bindings.DB, googleUser.name, googleUser.email);
      finalDisplayName = googleUser.name || finalUsername;
      // CineCub design standard: Always use CineCub default avatar, never Gmail profile pic
      finalPhotoUrl = "/assets/avatars/av_1.png";
      hasPassword = false;

      console.log(`[Google Auth] Creating NEW user in D1: ${finalUsername} (${finalUserId}), email: ${googleUser.email}`);

      // Set password_hash to provider reference "google:<sub_id>" so table constraint is satisfied
      // and password login is disabled until the user sets a password in their profile.
      const passwordPlaceholder = `google:${googleUser.sub}`;

      await bindings.DB.prepare(
        `INSERT INTO users (id, username, email, password_hash, display_name, photo_url, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
        .bind(
          finalUserId,
          finalUsername,
          googleUser.email,
          passwordPlaceholder,
          finalDisplayName,
          finalPhotoUrl,
          now,
          now
        )
        .run();

      // Initialize user library bundle in Cloudflare R2
      if (bindings.STORAGE) {
        const initialBundle: CloudBundle = { watchlist: [], history: [], progress: {} };
        await bindings.STORAGE.put(`users/${finalUserId}/library.json`, JSON.stringify(initialBundle), {
          httpMetadata: { contentType: "application/json" },
          customMetadata: { userId: finalUserId, createdAt: String(now) },
        }).catch((e: unknown) => console.warn("[Google Auth R2 Init Warning]", e));
      }
    }

    // 4. Sign JWT session token
    const idToken = await signJWT(
      {
        uid: finalUserId,
        email: googleUser.email,
        username: finalUsername,
        displayName: finalDisplayName,
        photoURL: finalPhotoUrl,
      },
      bindings.JWT_SECRET
    );

    return NextResponse.json(
      {
        success: true,
        isNewUser,
        user: {
          uid: finalUserId,
          email: googleUser.email,
          displayName: finalDisplayName,
          username: finalUsername,
          photoURL: finalPhotoUrl,
          hasPassword,
          emailVerified: true,
          idToken,
          refreshToken: idToken,
        },
      },
      { status: 200, headers: { "Content-Type": "application/json", ...authCors } }
    );
  } catch (err: unknown) {
    console.error("[Google Auth Error]", err);
    return NextResponse.json(
      { success: false, error: "SERVER_ERROR", message: "Google authentication failed. Please try again." },
      { status: 500, headers: { "Content-Type": "application/json", ...authCors } }
    );
  }
}
