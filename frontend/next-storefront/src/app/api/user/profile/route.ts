import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";
import { verifyJWT, signJWT } from "@/lib/auth-crypto";

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
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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

// GET: Fetch fresh user profile from Cloudflare D1
export async function GET(request: NextRequest) {
  const cors = getCorsHeaders(request);
  const bindings = await getCineCubBindings();
  const authUser = await authenticate(request, bindings.JWT_SECRET);

  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "Authentication required" },
      { status: 401, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  if (!bindings.DB) {
    return NextResponse.json(
      { success: false, error: "DATABASE_UNAVAILABLE", message: "Database binding unavailable" },
      { status: 503, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  try {
    const row = await bindings.DB.prepare(
      `SELECT id, username, email, display_name, photo_url, email_verified FROM users WHERE id = ? LIMIT 1`
    )
      .bind(authUser.uid)
      .first<{
        id: string;
        username: string;
        email: string;
        display_name: string;
        photo_url: string;
        email_verified: number;
      }>();

    if (!row) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "User not found" },
        { status: 404, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          uid: row.id,
          username: row.username,
          email: row.email,
          displayName: row.display_name,
          photoURL: row.photo_url || "/assets/avatars/av_1.png",
          emailVerified: Boolean(row.email_verified),
        },
      },
      { status: 200, headers: { "Content-Type": "application/json", ...cors } }
    );
  } catch (err: unknown) {
    console.error("[Profile GET Error]", err);
    return NextResponse.json(
      { success: false, error: "FETCH_FAILED", message: "Failed to fetch user profile" },
      { status: 500, headers: { "Content-Type": "application/json", ...cors } }
    );
  }
}

// POST: Update user profile (avatar, display name) in Cloudflare D1 and R2
export async function POST(request: NextRequest) {
  const cors = getCorsHeaders(request);
  const bindings = await getCineCubBindings();
  const authUser = await authenticate(request, bindings.JWT_SECRET);

  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "Authentication required" },
      { status: 401, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  if (!bindings.DB) {
    return NextResponse.json(
      { success: false, error: "DATABASE_UNAVAILABLE", message: "Database binding unavailable" },
      { status: 503, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      photoURL?: string;
      displayName?: string;
    };

    const photoURL = typeof body.photoURL === "string" ? body.photoURL.trim() : undefined;
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : undefined;

    let sanitizedDisplayName: string | undefined = undefined;
    if (displayName !== undefined) {
      sanitizedDisplayName = displayName.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
      if (sanitizedDisplayName.length < 2 || sanitizedDisplayName.length > 50) {
        return NextResponse.json(
          { success: false, error: "INVALID_NAME", message: "Display name must be between 2 and 50 characters" },
          { status: 400, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
    }

    let sanitizedPhotoURL: string | undefined = undefined;
    if (photoURL !== undefined) {
      const isKnownAvatar = /^\/assets\/avatars\/av_\d+\.png$/.test(photoURL);
      let isValidHttps = false;
      if (!isKnownAvatar && photoURL.length <= 500) {
        try {
          const u = new URL(photoURL);
          isValidHttps = u.protocol === "https:";
        } catch {}
      }

      if (!isKnownAvatar && !isValidHttps) {
        return NextResponse.json(
          { success: false, error: "INVALID_AVATAR", message: "Avatar must be a valid image path or HTTPS URL" },
          { status: 400, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
      sanitizedPhotoURL = photoURL;
    }

    if (!sanitizedPhotoURL && !sanitizedDisplayName) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "Nothing to update" },
        { status: 400, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    const now = Date.now();

    // 1. Update in Cloudflare D1
    if (sanitizedPhotoURL && sanitizedDisplayName) {
      await bindings.DB.prepare(
        `UPDATE users SET photo_url = ?, display_name = ?, updated_at = ? WHERE id = ?`
      )
        .bind(sanitizedPhotoURL, sanitizedDisplayName, now, authUser.uid)
        .run();
    } else if (sanitizedPhotoURL) {
      await bindings.DB.prepare(
        `UPDATE users SET photo_url = ?, updated_at = ? WHERE id = ?`
      )
        .bind(sanitizedPhotoURL, now, authUser.uid)
        .run();
    } else if (sanitizedDisplayName) {
      await bindings.DB.prepare(
        `UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`
      )
        .bind(sanitizedDisplayName, now, authUser.uid)
        .run();
    }

    // 2. Fetch fresh user row from D1
    const row = await bindings.DB.prepare(
      `SELECT id, username, email, display_name, photo_url, email_verified FROM users WHERE id = ? LIMIT 1`
    )
      .bind(authUser.uid)
      .first<{
        id: string;
        username: string;
        email: string;
        display_name: string;
        photo_url: string;
        email_verified: number;
      }>();

    if (!row) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "User not found after update" },
        { status: 404, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    const updatedPhotoURL = row.photo_url || "/assets/avatars/av_1.png";
    const updatedDisplayName = row.display_name;

    // 3. Issue fresh JWT with updated profile
    const idToken = await signJWT(
      {
        uid: row.id,
        email: row.email,
        username: row.username,
        displayName: updatedDisplayName,
        photoURL: updatedPhotoURL,
      },
      bindings.JWT_SECRET
    );

    // 4. Update avatar in Cloudflare R2 library bundle as secondary sync source
    if (bindings.STORAGE && photoURL) {
      try {
        const key = `users/${row.id}/library.json`;
        const object = await bindings.STORAGE.get(key);
        if (object) {
          const text = await object.text();
          const bundle = JSON.parse(text);
          bundle.avatar = updatedPhotoURL;
          await bindings.STORAGE.put(key, JSON.stringify(bundle), {
            httpMetadata: { contentType: "application/json" },
            customMetadata: { userId: row.id, updatedAt: String(now) },
          });
        }
      } catch (r2Err) {
        console.warn("[Profile Update R2 Sync Warning]", r2Err);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Profile updated successfully",
        user: {
          uid: row.id,
          email: row.email,
          displayName: updatedDisplayName,
          username: row.username,
          photoURL: updatedPhotoURL,
          emailVerified: Boolean(row.email_verified),
          idToken,
          refreshToken: idToken,
        },
      },
      { status: 200, headers: { "Content-Type": "application/json", ...cors } }
    );
  } catch (err: unknown) {
    console.error("[Profile POST Error]", err);
    return NextResponse.json(
      { success: false, error: "UPDATE_FAILED", message: "Failed to update profile" },
      { status: 500, headers: { "Content-Type": "application/json", ...cors } }
    );
  }
}
