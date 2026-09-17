import { fetchCloudData, pushCloudData, refreshIdToken, type CloudBundle, type StoredUser } from "./user-sync";
import type { WatchlistItem, HistoryItem, ProgressData } from "./types";

const LS_WATCHLIST = "sh_watchlist";
const LS_HISTORY = "sh_history";
const LS_PROGRESS = "sh_progress_store";
const LS_USER = "sh_user";
const LS_LAST_SYNCED = "sh_last_synced_at";

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS(key: string, data: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function keyOf(item: { id: number; type: string }) {
  return `${item.type}:${item.id}`;
}

export function mergeWatchlist(local: WatchlistItem[], cloud: WatchlistItem[]): WatchlistItem[] {
  const map = new Map<string, WatchlistItem>();
  for (const item of cloud || []) map.set(keyOf(item), item);
  for (const item of local || []) {
    const existing = map.get(keyOf(item));
    if (!existing) map.set(keyOf(item), item);
    else if ((item.addedAt || 0) > (existing.addedAt || 0)) map.set(keyOf(item), item);
  }
  return Array.from(map.values());
}

export function reconcileWatchlist(
  local: WatchlistItem[],
  cloud: WatchlistItem[],
  lastSyncTime: number,
  cloudUpdatedAt: number
): WatchlistItem[] {
  // If this device/browser has never synced this account before, union-merge local guest items with cloud
  if (lastSyncTime === 0) {
    return mergeWatchlist(local, cloud);
  }

  // If cloud was updated after our last sync (changes made on another device):
  if (cloudUpdatedAt > lastSyncTime) {
    const map = new Map<string, WatchlistItem>();
    // 1. Cloud is authoritative for existing items
    for (const item of cloud || []) {
      map.set(keyOf(item), item);
    }
    // 2. Only keep local items that were added ON THIS DEVICE AFTER our last sync (e.g. offline additions)
    // If addedAt <= lastSyncTime and missing from cloud, it was deleted on another device: DO NOT resurrect!
    for (const item of local || []) {
      const k = keyOf(item);
      if (!map.has(k)) {
        if (item.addedAt && item.addedAt > lastSyncTime) {
          map.set(k, item);
        }
      } else {
        const existing = map.get(k)!;
        if ((item.addedAt || 0) > (existing.addedAt || 0)) {
          map.set(k, item);
        }
      }
    }
    return Array.from(map.values());
  }

  // If local is newer or equal, keep local
  return local;
}

export function mergeHistory(local: HistoryItem[], cloud: HistoryItem[]): HistoryItem[] {
  const map = new Map<string, HistoryItem>();
  for (const item of cloud || []) map.set(keyOf(item), item);
  for (const item of local || []) {
    const existing = map.get(keyOf(item));
    if (!existing) map.set(keyOf(item), item);
    else if ((item.updatedAt || item.progress || 0) > (existing.updatedAt || existing.progress || 0))
      map.set(keyOf(item), item);
  }
  return Array.from(map.values())
    .sort((a, b) => (b.updatedAt || b.progress || 0) - (a.updatedAt || a.progress || 0))
    .slice(0, 50);
}

export function reconcileHistory(
  local: HistoryItem[],
  cloud: HistoryItem[],
  lastSyncTime: number,
  cloudUpdatedAt: number
): HistoryItem[] {
  if (lastSyncTime === 0) {
    return mergeHistory(local, cloud);
  }

  if (cloudUpdatedAt > lastSyncTime) {
    const map = new Map<string, HistoryItem>();
    for (const item of cloud || []) {
      map.set(keyOf(item), item);
    }
    for (const item of local || []) {
      const k = keyOf(item);
      if (!map.has(k)) {
        // If watched on this device after our last sync, keep it
        if ((item.updatedAt || 0) > lastSyncTime) {
          map.set(k, item);
        }
        // Otherwise, if cleared on another device, do not resurrect
      } else {
        const existing = map.get(k)!;
        if ((item.updatedAt || item.progress || 0) > (existing.updatedAt || existing.progress || 0)) {
          map.set(k, item);
        }
      }
    }
    return Array.from(map.values())
      .sort((a, b) => (b.updatedAt || b.progress || 0) - (a.updatedAt || a.progress || 0))
      .slice(0, 50);
  }

  return local;
}

export function mergeProgress(local: Record<string, ProgressData>, cloud: Record<string, ProgressData>): Record<string, ProgressData> {
  const out: Record<string, ProgressData> = {};
  for (const k of Object.keys(cloud || {})) {
    if (cloud[k] && (cloud[k].updatedAt || 0) > 0) out[k] = cloud[k];
  }
  for (const k of Object.keys(local || {})) {
    if (!local[k]) continue;
    const existing = out[k];
    if (!existing) out[k] = local[k];
    else if ((local[k].updatedAt || 0) > (existing.updatedAt || 0)) out[k] = local[k];
  }
  const keys = Object.keys(out);
  if (keys.length > 150) {
    const sorted = keys.sort((a, b) => (out[a].updatedAt || 0) - (out[b].updatedAt || 0));
    for (const k of sorted.slice(0, keys.length - 150)) delete out[k];
  }
  return out;
}

function buildBundle(
  watchlist: WatchlistItem[],
  history: HistoryItem[],
  progress: Record<string, ProgressData>,
  avatar?: string,
  updatedAt?: number
): CloudBundle {
  return { watchlist, history, progress, ...(avatar ? { avatar } : {}), updatedAt: updatedAt || Date.now() };
}

export function getStoredUser(): StoredUser | null {
  return loadLS<StoredUser | null>(LS_USER, null);
}

export async function ensureToken(user: StoredUser): Promise<string | null> {
  if (user.idToken) return user.idToken;
  if (user.refreshToken) {
    try {
      const token = await refreshIdToken(user.refreshToken);
      const updated = { ...user, idToken: token };
      saveLS(LS_USER, updated);
      return token;
    } catch {
      return null;
    }
  }
  return null;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleCloudPush() {
  if (typeof window === "undefined") return;
  const user = getStoredUser();
  if (!user || !user.uid) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      await pushLocalToCloud(user.uid);
    } catch {}
  }, 1200);
}

export async function pushLocalToCloud(uid: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const stored = loadLS<StoredUser | null>(LS_USER, null) || { uid } as StoredUser;
  const token = await ensureToken(stored);
  if (!token) return false;
  const now = Date.now();
  const bundle = buildBundle(
    loadLS<WatchlistItem[]>(LS_WATCHLIST, []),
    loadLS<HistoryItem[]>(LS_HISTORY, []),
    loadLS<Record<string, ProgressData>>(LS_PROGRESS, {}),
    stored.photoURL,
    now
  );
  try {
    const ok = await pushCloudData(uid, token, bundle);
    if (ok) {
      saveLS(LS_LAST_SYNCED, now);
    }
    return ok;
  } catch (e) {
    console.error("[sync] cloud push failed:", e);
    return false;
  }
}

export async function syncUserOnLogin(uid: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const stored = loadLS<StoredUser | null>(LS_USER, null);
  if (!stored || stored.uid !== uid) return false;
  const token = await ensureToken(stored);
  if (!token) return false;

  try {
    const remote = await fetchCloudData(uid, token);
    const lastSync = loadLS<number>(LS_LAST_SYNCED, 0);
    const cloudUpdatedAt = remote?.updatedAt || 0;

    const localWatchlist = loadLS<WatchlistItem[]>(LS_WATCHLIST, []);
    const localHistory = loadLS<HistoryItem[]>(LS_HISTORY, []);
    const localProgress = loadLS<Record<string, ProgressData>>(LS_PROGRESS, {});

    const mergedWatchlist = reconcileWatchlist(localWatchlist, remote?.watchlist || [], lastSync, cloudUpdatedAt);
    const mergedHistory = reconcileHistory(localHistory, remote?.history || [], lastSync, cloudUpdatedAt);
    const mergedProgress = mergeProgress(localProgress, remote?.progress || {});

    saveLS(LS_WATCHLIST, mergedWatchlist);
    saveLS(LS_HISTORY, mergedHistory);
    saveLS(LS_PROGRESS, mergedProgress);

    if (remote?.avatar && stored.photoURL !== remote.avatar) {
      stored.photoURL = remote.avatar;
      saveLS(LS_USER, stored);
      saveLS("cachedAvatar", remote.avatar);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sh-profile-updated", { detail: stored }));
      }
    }

    // Determine if we have local offline additions or if it's first-time login
    const hasLocalOfflineAdditions =
      lastSync === 0 ||
      mergedWatchlist.length > (remote?.watchlist || []).length ||
      mergedHistory.length > (remote?.history || []).length;

    if (hasLocalOfflineAdditions) {
      const now = Date.now();
      await pushCloudData(
        uid,
        token,
        buildBundle(mergedWatchlist, mergedHistory, mergedProgress, stored.photoURL, now)
      );
      saveLS(LS_LAST_SYNCED, now);
    } else {
      saveLS(LS_LAST_SYNCED, Math.max(cloudUpdatedAt, Date.now()));
    }

    // Also fetch the authoritative profile from D1
    syncUserProfile().catch(() => {});

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("vidLinkProgress");
      } catch {}
      window.dispatchEvent(new Event("sh-sync-complete"));
    }
    return true;
  } catch (e) {
    console.error("[sync] login merge failed:", e);
    return false;
  }
}

export async function syncUserProfile(): Promise<StoredUser | null> {
  if (typeof window === "undefined") return null;
  const stored = getStoredUser();
  if (!stored || !stored.uid) return null;
  const token = await ensureToken(stored);
  if (!token) return null;

  try {
    const res = await fetch("/api/user/profile", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; user?: Partial<StoredUser> };
    if (json.success && json.user) {
      let changed = false;
      const updated = { ...stored };
      if (json.user.photoURL && json.user.photoURL !== stored.photoURL) {
        updated.photoURL = json.user.photoURL;
        saveLS("cachedAvatar", json.user.photoURL);
        changed = true;
      }
      if (json.user.displayName && json.user.displayName !== stored.displayName) {
        updated.displayName = json.user.displayName;
        saveLS("cachedName", json.user.displayName);
        changed = true;
      }
      if (json.user.username && json.user.username !== stored.username) {
        updated.username = json.user.username;
        changed = true;
      }
      if (json.user.email && json.user.email !== stored.email) {
        updated.email = json.user.email;
        changed = true;
      }
      if (json.user.hasPassword !== undefined && json.user.hasPassword !== stored.hasPassword) {
        updated.hasPassword = json.user.hasPassword;
        changed = true;
      }
      if (json.user.idToken) {
        updated.idToken = json.user.idToken;
      }
      if (changed) {
        saveLS(LS_USER, updated);
        window.dispatchEvent(new CustomEvent("sh-profile-updated", { detail: updated }));
      }
      return updated;
    }
  } catch (err) {
    console.warn("[sync] Profile fetch failed:", err);
  }
  return null;
}

export function hasLiveSync(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(getStoredUser()?.uid);
}