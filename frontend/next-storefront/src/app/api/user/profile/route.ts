import { NextRequest, NextResponse } from "next/server";
import { getCineCubBindings } from "@/lib/cloudflare";
import { verifyJWT, signJWT, hashPassword, verifyPassword } from "@/lib/auth-crypto";

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
    "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
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
      `SELECT id, username, email, display_name, photo_url, email_verified, password_hash FROM users WHERE id = ? LIMIT 1`
    )
      .bind(authUser.uid)
      .first<{
        id: string;
        username: string;
        email: string;
        display_name: string;
        photo_url: string;
        email_verified: number;
        password_hash: string;
      }>();

    if (!row) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "User not found" },
        { status: 404, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    const refreshedToken = await signJWT(
      {
        uid: row.id,
        email: row.email,
        username: row.username,
        displayName: row.display_name,
        photoURL: row.photo_url || "/assets/avatars/av_1.png",
      },
      bindings.JWT_SECRET
    );

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
          hasPassword: !row.password_hash.startsWith("google:"),
          idToken: refreshedToken,
          refreshToken: refreshedToken,
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

// POST: Update user profile (avatar, display name, username, email, password) in Cloudflare D1 and R2
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
      username?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    // 1. Fetch existing user record
    const existing = await bindings.DB.prepare(
      `SELECT id, username, email, display_name, photo_url, email_verified, password_hash FROM users WHERE id = ? LIMIT 1`
    )
      .bind(authUser.uid)
      .first<{
        id: string;
        username: string;
        email: string;
        display_name: string;
        photo_url: string;
        email_verified: number;
        password_hash: string;
      }>();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "User not found" },
        { status: 404, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    let sanitizedDisplayName: string | undefined = undefined;
    if (body.displayName !== undefined) {
      sanitizedDisplayName = body.displayName.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
      if (sanitizedDisplayName.length < 2 || sanitizedDisplayName.length > 50) {
        return NextResponse.json(
          { success: false, error: "INVALID_NAME", message: "Display name must be between 2 and 50 characters" },
          { status: 400, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
    }

    let sanitizedPhotoURL: string | undefined = undefined;
    if (body.photoURL !== undefined) {
      const trimmedPhoto = body.photoURL.trim();
      const isKnownAvatar = /^\/assets\/avatars\/av_\d+\.png$/.test(trimmedPhoto);
      let isValidHttps = false;
      if (!isKnownAvatar && trimmedPhoto.length <= 500) {
        try {
          const u = new URL(trimmedPhoto);
          isValidHttps = u.protocol === "https:";
        } catch {}
      }

      if (!isKnownAvatar && !isValidHttps) {
        return NextResponse.json(
          { success: false, error: "INVALID_AVATAR", message: "Avatar must be a valid image path or HTTPS URL" },
          { status: 400, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
      sanitizedPhotoURL = trimmedPhoto;
    }

    let sanitizedUsername: string | undefined = undefined;
    if (body.username !== undefined) {
      sanitizedUsername = body.username.trim().toLowerCase();
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(sanitizedUsername)) {
        return NextResponse.json(
          { success: false, error: "INVALID_USERNAME", message: "Username must be 3-20 alphanumeric characters or underscores" },
          { status: 400, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
      const RESERVED_USERNAMES = new Set([
        "admin", "root", "superuser", "moderator", "support", "help",
        "streamheaven", "cinecub", "system", "null", "undefined",
      ]);
      if (RESERVED_USERNAMES.has(sanitizedUsername)) {
        return NextResponse.json(
          { success: false, error: "RESERVED_USERNAME", message: "This username is reserved and cannot be chosen" },
          { status: 400, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
      if (sanitizedUsername !== existing.username.toLowerCase()) {
        const conflict = await bindings.DB.prepare(
          `SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1`
        )
          .bind(sanitizedUsername, authUser.uid)
          .first<{ id: string }>();

        if (conflict) {
          return NextResponse.json(
            { success: false, error: "USERNAME_TAKEN", message: "This username is already taken" },
            { status: 409, headers: { "Content-Type": "application/json", ...cors } }
          );
        }
      }
    }

    let sanitizedEmail: string | undefined = undefined;
    if (body.email !== undefined) {
      sanitizedEmail = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
        return NextResponse.json(
          { success: false, error: "INVALID_EMAIL", message: "Please provide a valid email address" },
          { status: 400, headers: { "Content-Type": "application/json", ...cors } }
        );
      }
      if (sanitizedEmail !== existing.email.toLowerCase()) {
        const isGoogleOnly = existing.password_hash.startsWith("google:");
        if (!isGoogleOnly) {
          if (!body.currentPassword) {
            return NextResponse.json(
              { success: false, error: "MISSING_CURRENT_PASSWORD", message: "Current password is required to change email" },
              { status: 400, headers: { "Content-Type": "application/json", ...cors } }
            );
          }
          const isMatch = await verifyPassword(body.currentPassword, existing.password_hash);
          if (!isMatch) {
            return NextResponse.json(
              { success: false, error: "INCORRECT_CURRENT_PASSWORD", message: "Current password is incorrect" },
              { status: 400, headers: { "Content-Type": "application/json", ...cors } }
            );
          }
        }
        const conflict = await bindings.DB.prepare(
          `SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1`
        )
          .bind(sanitizedEmail, authUser.uid)
          .first<{ id: string }>();

        if (conflict) {
          return NextResponse.json(
            { success: false, error: "EMAIL_TAKEN", message: "An account with this email already exists" },
            { status: 409, headers: { "Content-Type": "application/json", ...cors } }
          );
        }
      }
    }

    let newPasswordHash: string | undefined = undefined;
    if (body.newPassword !== undefined && body.newPassword.length > 0) {
      if (body.newPassword.length < 6) {
        return NextResponse.json(
          { success: false, error: "PASSWORD_TOO_SHORT", message: "Password must be at least 6 characters" },
          { status: 400, headers: { "Content-Type": "application/json", ...cors } }
        );
      }

      const isGoogleOnly = existing.password_hash.startsWith("google:");
      if (!isGoogleOnly) {
        // User already has a custom password, current password is required
        if (!body.currentPassword) {
          return NextResponse.json(
            { success: false, error: "MISSING_CURRENT_PASSWORD", message: "Current password is required to change password" },
            { status: 400, headers: { "Content-Type": "application/json", ...cors } }
          );
        }
        const isMatch = await verifyPassword(body.currentPassword, existing.password_hash);
        if (!isMatch) {
          return NextResponse.json(
            { success: false, error: "INCORRECT_CURRENT_PASSWORD", message: "Current password is incorrect" },
            { status: 400, headers: { "Content-Type": "application/json", ...cors } }
          );
        }
      }

      newPasswordHash = await hashPassword(body.newPassword);
    }

    if (
      !sanitizedPhotoURL &&
      !sanitizedDisplayName &&
      !sanitizedUsername &&
      !sanitizedEmail &&
      !newPasswordHash
    ) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "Nothing to update" },
        { status: 400, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    const now = Date.now();
    const finalPhoto = sanitizedPhotoURL ?? existing.photo_url;
    const finalDisplayName = sanitizedDisplayName ?? existing.display_name;
    const finalUsername = sanitizedUsername ?? existing.username;
    const finalEmail = sanitizedEmail ?? existing.email;
    const finalPasswordHash = newPasswordHash ?? existing.password_hash;
    const finalEmailVerified =
      sanitizedEmail && sanitizedEmail !== existing.email.toLowerCase()
        ? 0
        : existing.email_verified;

    // 2. Update D1
    await bindings.DB.prepare(
      `UPDATE users
       SET photo_url = ?,
           display_name = ?,
           username = ?,
           email = ?,
           password_hash = ?,
           email_verified = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        finalPhoto,
        finalDisplayName,
        finalUsername,
        finalEmail,
        finalPasswordHash,
        finalEmailVerified,
        now,
        authUser.uid
      )
      .run();

    // 3. Issue fresh JWT with updated profile
    const idToken = await signJWT(
      {
        uid: existing.id,
        email: finalEmail,
        username: finalUsername,
        displayName: finalDisplayName,
        photoURL: finalPhoto,
      },
      bindings.JWT_SECRET
    );

    // 4. Update avatar in Cloudflare R2 library bundle as secondary sync source
    if (bindings.STORAGE && sanitizedPhotoURL) {
      try {
        const key = `users/${existing.id}/library.json`;
        const object = await bindings.STORAGE.get(key);
        if (object) {
          const text = await object.text();
          const bundle = JSON.parse(text);
          bundle.avatar = finalPhoto;
          await bindings.STORAGE.put(key, JSON.stringify(bundle), {
            httpMetadata: { contentType: "application/json" },
            customMetadata: { userId: existing.id, updatedAt: String(now) },
          });
        }
      } catch (r2Err) {
        console.warn("[Profile Update R2 Sync Warning]", r2Err);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: newPasswordHash
          ? existing.password_hash.startsWith("google:")
            ? "Password set successfully! You can now log in with email/password or Google."
            : "Password updated successfully"
          : "Profile updated successfully",
        user: {
          uid: existing.id,
          email: finalEmail,
          displayName: finalDisplayName,
          username: finalUsername,
          photoURL: finalPhoto,
          emailVerified: Boolean(finalEmailVerified),
          hasPassword: !finalPasswordHash.startsWith("google:"),
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

// DELETE: Permanently delete user account from Cloudflare D1 and wipe user library from R2
export async function DELETE(request: NextRequest) {
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
      { success: false, error: "DATABASE_UNAVAILABLE", message: "Database service unavailable" },
      { status: 503, headers: { "Content-Type": "application/json", ...cors } }
    );
  }

  try {
    // 1. Delete user record from Cloudflare D1
    await bindings.DB.prepare("DELETE FROM users WHERE id = ?").bind(authUser.uid).run();

    // 2. Delete user library bundle from Cloudflare R2
    if (bindings.STORAGE) {
      try {
        await bindings.STORAGE.delete(`users/${authUser.uid}/library.json`);
      } catch (r2Err) {
        console.warn("[Delete Account R2 Warning]", r2Err);
      }
    }

    return NextResponse.json(
      { success: true, message: "Account deleted successfully" },
      { status: 200, headers: { "Content-Type": "application/json", ...cors } }
    );
  } catch (err: unknown) {
    console.error("[Delete Account Error]", err);
    return NextResponse.json(
      { success: false, error: "DELETE_FAILED", message: "Failed to delete account" },
      { status: 500, headers: { "Content-Type": "application/json", ...cors } }
    );
  }
}
