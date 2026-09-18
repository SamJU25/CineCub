import type { WatchlistItem, HistoryItem, ProgressData, CloudBundle } from "./types";

export interface StoredUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  username?: string;
  hasPassword?: boolean;
  emailVerified?: boolean;
  idToken?: string;
  refreshToken?: string;
}

export type { CloudBundle };

/**
 * Return valid JWT token (persisted on client)
 */
export async function refreshIdToken(refreshToken: string): Promise<string> {
  return refreshToken;
}

/**
 * Fetch user library bundle (watchlist, history, progress) from Cloudflare R2
 */
export async function fetchCloudData(uid: string, idToken: string): Promise<CloudBundle | null> {
  try {
    const res = await fetch("/api/user/sync", {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (res.status === 401) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("sh-session-expired"));
      }
      return null;
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[Cloudflare R2 Sync] GET failed with status: ${res.status}`);
      return null;
    }

    const json = (await res.json()) as { success?: boolean; data?: CloudBundle };
    return json.data || null;
  } catch (err) {
    console.error("[Cloudflare R2 Sync] Fetch failed:", err);
    return null;
  }
}

/**
 * Push user library bundle to Cloudflare R2
 */
export async function pushCloudData(
  uid: string,
  idToken: string,
  data: {
    watchlist?: WatchlistItem[];
    history?: HistoryItem[];
    progress?: Record<string, ProgressData>;
    avatar?: string;
    updatedAt?: number;
  }
): Promise<boolean> {
  try {
    const res = await fetch("/api/user/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(data),
    });

    if (res.status === 401) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("sh-session-expired"));
      }
      return false;
    }

    if (!res.ok) {
      console.warn(`[Cloudflare R2 Sync] Push failed with status: ${res.status}`);
      return false;
    }

    const json = (await res.json()) as { success?: boolean };
    return !!json.success;
  } catch (err) {
    console.error("[Cloudflare R2 Sync] Push error:", err);
    return false;
  }
}
