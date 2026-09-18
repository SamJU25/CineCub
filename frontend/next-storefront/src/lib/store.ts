import { create } from "zustand";
import type { WatchlistItem, HistoryItem, ProgressData, StreamMode } from "./types";
import { scheduleCloudPush, syncUserOnLogin, cancelCloudPush, clearLocalLibraryData } from "./sync";

export type Page = "home" | "browse" | "search" | "watchlist" | "history" | "profile";

interface User {
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

interface AppState {
  activePage: Page;
  setActivePage: (p: Page) => void;

  user: User | null;
  setUser: (user: User, options?: { isNewAccount?: boolean }) => void;
  logout: () => void;

  profilePanelOpen: boolean;
  toggleProfilePanel: () => void;
  openProfilePanel: () => void;
  closeProfilePanel: () => void;

  logoutConfirmOpen: boolean;
  openLogoutConfirm: () => void;
  closeLogoutConfirm: () => void;

  browseType: "all" | "movie" | "tv" | "anime";
  browseCategory: string;
  browseSort: string;
  browseGenreId: number | null;
  browseTrendingTime: string;
  setBrowseType: (t: "all" | "movie" | "tv" | "anime") => void;
  setBrowseCategory: (c: string, genreId?: number | null) => void;
  setBrowseSort: (s: string) => void;
  setBrowseGenreId: (id: number | null) => void;
  setBrowseTrendingTime: (t: string) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;

  detailModal: { id: number; type: string } | null;
  openDetail: (id: number, type: string) => void;
  closeDetail: () => void;

  playerModal: { id: number; type: string; title: string; season?: number; episode?: number; poster?: string } | null;
  openPlayer: (id: number, type: string, title: string, season?: number, episode?: number, poster?: string) => void;
  closePlayer: () => void;

  trailerModal: { title: string; youtubeKey: string } | null;
  openTrailer: (title: string, key: string) => void;
  closeTrailer: () => void;

  authModal: boolean;
  openAuth: () => void;
  closeAuth: () => void;

  legalModal: { type: string } | null;
  openLegal: (type: string) => void;
  closeLegal: () => void;

  appsModal: boolean;
  openApps: () => void;
  closeApps: () => void;

  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebarCollapse: () => void;

  watchlist: WatchlistItem[];
  addToWatchlist: (item: WatchlistItem) => void;
  removeFromWatchlist: (id: number) => void;
  clearWatchlist: () => void;
  isInWatchlist: (id: number) => boolean;

  history: HistoryItem[];
  addToHistory: (item: HistoryItem) => void;
  clearHistory: () => void;

  progress: Record<string, ProgressData>;
  saveProgress: (key: string, data: ProgressData) => void;
  getProgress: (key: string) => ProgressData | undefined;

  streamMode: StreamMode;
  setStreamMode: (m: StreamMode) => void;

  playbackSpeed: number;
  setPlaybackSpeed: (s: number) => void;

  preferredResolution: number;
  setPreferredResolution: (r: number) => void;
}

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

export const useStore = create<AppState>((set, get) => ({
  activePage: "home",
  setActivePage: (p) => set({ activePage: p }),

  user: loadJSON<User | null>("sh_user", null),
  setUser: (user, options) => {
    saveJSON("sh_user", user);
    saveJSON("cachedAvatar", user.photoURL);
    saveJSON("cachedName", user.displayName);
    if (user.username) saveJSON("cachedUsername", user.username);
    if (options?.isNewAccount) {
      clearLocalLibraryData();
      set({ user, watchlist: [], history: [], progress: {} });
    } else {
      set({ user });
    }
    if (user.uid && typeof window !== "undefined") {
      syncUserOnLogin(user.uid, options);
    }
  },
  logout: () => {
    cancelCloudPush();
    clearLocalLibraryData();
    try {
      localStorage.removeItem("sh_user");
      localStorage.removeItem("cachedAvatar");
      localStorage.removeItem("cachedName");
      localStorage.removeItem("cachedUsername");
      localStorage.removeItem("sh_last_synced_at");
      localStorage.removeItem("sh_last_synced_uid");
    } catch {}
    set({
      user: null,
      profilePanelOpen: false,
      logoutConfirmOpen: false,
      watchlist: [],
      history: [],
      progress: {},
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("playback-progress-updated"));
      window.dispatchEvent(new Event("sh-sync-complete"));
    }
  },

  profilePanelOpen: false,
  toggleProfilePanel: () => set((s) => ({ profilePanelOpen: !s.profilePanelOpen })),
  openProfilePanel: () => set({ profilePanelOpen: true }),
  closeProfilePanel: () => set({ profilePanelOpen: false }),

  logoutConfirmOpen: false,
  openLogoutConfirm: () => set({ logoutConfirmOpen: true, profilePanelOpen: false }),
  closeLogoutConfirm: () => set({ logoutConfirmOpen: false }),

  browseType: "all",
  browseCategory: "trending",
  browseSort: "trending",
  browseGenreId: null,
  browseTrendingTime: "day",
  setBrowseType: (t) => set({ browseType: t }),
  setBrowseCategory: (c, genreId = null) => {
    const isStandard = c === "movie" || c === "tv" || c === "anime";
    const bType = isStandard ? (c as "movie" | "tv" | "anime") : "all";
    const bSort =
      c === "trending"
        ? "trending"
        : c === "toprated"
        ? "toprated"
        : c === "upcoming"
        ? "newest"
        : "popular";
    set({
      browseCategory: c,
      browseGenreId: genreId,
      browseType: bType,
      browseSort: bSort,
      browseTrendingTime: "day",
    });
  },
  setBrowseSort: (s) => set({ browseSort: s }),
  setBrowseGenreId: (id) => set({ browseGenreId: id }),
  setBrowseTrendingTime: (t) => set({ browseTrendingTime: t }),

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),

  detailModal: null,
  openDetail: (id, type) => {
    const normType = type === "anime" ? "tv" : (type || "movie");
    set({ detailModal: { id, type: normType } });
    if (typeof window !== "undefined") {
      try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get("id") !== String(id)) {
          currentUrl.searchParams.set("id", String(id));
          currentUrl.searchParams.set("type", normType);
          window.history.pushState({ modal: "detail", id }, "", currentUrl.toString());
        }
      } catch {}
    }
  },
  closeDetail: () => {
    set({ detailModal: null });
    if (typeof window !== "undefined") {
      try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has("id")) {
          currentUrl.searchParams.delete("id");
          currentUrl.searchParams.delete("type");
          currentUrl.searchParams.delete("s");
          currentUrl.searchParams.delete("e");
          const cleanUrl = currentUrl.pathname + (currentUrl.search ? currentUrl.search : "");
          window.history.pushState({ modal: null }, "", cleanUrl);
        }
      } catch {}
    }
  },

  playerModal: null,
  openPlayer: (id, type, title, season, episode, poster) => {
    const normType = type === "anime" ? "tv" : (type || "movie");
    set({ playerModal: { id, type: normType, title, season, episode, poster } });
    if (typeof window !== "undefined") {
      try {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set("id", String(id));
        currentUrl.searchParams.set("type", normType);
        if (season && episode) {
          currentUrl.searchParams.set("s", String(season));
          currentUrl.searchParams.set("e", String(episode));
        }
        window.history.pushState({ modal: "player", id, season, episode }, "", currentUrl.toString());
      } catch {}
    }
  },
  closePlayer: () => {
    set({ playerModal: null });
    if (typeof window !== "undefined") {
      try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has("id") && !get().detailModal) {
          currentUrl.searchParams.delete("id");
          currentUrl.searchParams.delete("type");
          currentUrl.searchParams.delete("s");
          currentUrl.searchParams.delete("e");
          const cleanUrl = currentUrl.pathname + (currentUrl.search ? currentUrl.search : "");
          window.history.pushState({ modal: null }, "", cleanUrl);
        }
      } catch {}
    }
  },

  trailerModal: null,
  openTrailer: (title, key) => set({ trailerModal: { title, youtubeKey: key } }),
  closeTrailer: () => set({ trailerModal: null }),

  authModal: false,
  openAuth: () => set({ authModal: true }),
  closeAuth: () => set({ authModal: false }),

  legalModal: null,
  openLegal: (type) => set({ legalModal: { type } }),
  closeLegal: () => set({ legalModal: null }),

  appsModal: false,
  openApps: () => set({ appsModal: true }),
  closeApps: () => set({ appsModal: false }),

  sidebarOpen: false,
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebarCollapse: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  watchlist: loadJSON<WatchlistItem[]>("sh_watchlist", []),
  addToWatchlist: (item) => {
    if (get().watchlist.some((existing) => existing.id === item.id && existing.type === item.type)) return;
    const itemWithTime: WatchlistItem = {
      ...item,
      addedAt: item.addedAt || Date.now(),
    };
    const wl = [...get().watchlist, itemWithTime];
    saveJSON("sh_watchlist", wl);
    set({ watchlist: wl });
    scheduleCloudPush();
  },
  removeFromWatchlist: (id) => {
    const wl = get().watchlist.filter((i) => i.id !== id);
    saveJSON("sh_watchlist", wl);
    set({ watchlist: wl });
    scheduleCloudPush();
  },
  clearWatchlist: () => {
    saveJSON("sh_watchlist", []);
    set({ watchlist: [] });
    scheduleCloudPush();
  },
  isInWatchlist: (id) => get().watchlist.some((i) => i.id === id),

  history: loadJSON<HistoryItem[]>("sh_history", []),
  addToHistory: (item) => {
    const itemWithTime: HistoryItem = {
      ...item,
      updatedAt: item.updatedAt || Date.now(),
    };
    const h = [itemWithTime, ...get().history.filter((i) => !(i.id === item.id && i.type === item.type))].slice(0, 50);
    saveJSON("sh_history", h);
    set({ history: h });
    scheduleCloudPush();
  },
  clearHistory: () => {
    saveJSON("sh_history", []);
    saveJSON("sh_progress_store", {});
    try {
      localStorage.removeItem("sh_progress_store");
      localStorage.removeItem("vidLinkProgress");
    } catch {}
    set({ history: [], progress: {} });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("playback-progress-updated"));
    }
    scheduleCloudPush();
  },

  progress: loadJSON<Record<string, ProgressData>>("sh_progress_store", {}),
  saveProgress: (key, data) => {
    const dataWithTime: ProgressData = {
      ...data,
      updatedAt: data.updatedAt || Date.now(),
    };
    const p = { ...get().progress, [key]: dataWithTime };
    const keys = Object.keys(p);
    if (keys.length > 150) {
      const sorted = keys.sort((a, b) => (p[a].updatedAt || 0) - (p[b].updatedAt || 0));
      for (const k of sorted.slice(0, keys.length - 150)) delete p[k];
    }
    saveJSON("sh_progress_store", p);
    set({ progress: p });
    scheduleCloudPush();
  },
  getProgress: (key) => get().progress[key],

  streamMode: ((loadJSON<string>("cinecub_stream_mode", "") || loadJSON<string>("streamheaven_stream_mode", "direct")) as StreamMode) || "direct",
  setStreamMode: (m) => {
    saveJSON("cinecub_stream_mode", m);
    set({ streamMode: m });
  },

  playbackSpeed: loadJSON<number>("cinecub_speed", 0) || loadJSON<number>("streamheaven_speed", 1) || 1,
  setPlaybackSpeed: (s) => {
    saveJSON("cinecub_speed", s);
    set({ playbackSpeed: s });
  },

  preferredResolution: loadJSON<number>("cinecub_preferred_res", 0) || loadJSON<number>("streamheaven_preferred_res", 1080) || 1080,
  setPreferredResolution: (r) => {
    saveJSON("cinecub_preferred_res", r);
    set({ preferredResolution: r });
  },
}));

/* One-time migration: seed Watch History from existing progress data (legacy carry-over
   from the old Astro storefront where progress was saved but history was not). Runs once,
   guarded by a flag so a manual "Clear History" is not silently undone. */
const BACKFILL_FLAG = "sh_history_backfilled_v1";

function backfillHistoryFromProgress() {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(BACKFILL_FLAG)) return;
    const existing = loadJSON<HistoryItem[]>("sh_history", []);
    if (existing.length > 0) return;
    const progress = loadJSON<Record<string, { pct?: number; progress?: number; title?: string; poster?: string; type?: string; updatedAt?: number }>>("sh_progress_store", {});
    const entries = Object.entries(progress);
    if (entries.length === 0) return;

    const seeded: HistoryItem[] = entries
      .filter(([, p]) => p && typeof p.pct === "number" && p.pct > 0)
      .map(([key, p]) => {
        const isTv = key.includes("_s");
        let id = key;
        let season: number | undefined;
        let episode: number | undefined;
        if (isTv) {
          const parts = key.split("_s");
          id = parts[0];
          const epParts = (parts[1] || "").split("e");
          season = parseInt(epParts[0], 10) || undefined;
          episode = parseInt(epParts[1], 10) || undefined;
        }
        return {
          id: parseInt(String(id), 10),
          type: isTv ? "tv" : "movie",
          title: p.title || (isTv ? `Series (S${season || 1} E${episode || 1})` : "Movie"),
          poster: p.poster ?? null,
          poster_path: p.poster ?? null,
          season,
          episode,
          progress: typeof p.progress === "number" ? p.progress : p.pct,
          updatedAt: p.updatedAt || Date.now(),
        } as HistoryItem;
      })
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 50);

    if (seeded.length === 0) return;
    saveJSON("sh_history", seeded);
    localStorage.setItem(BACKFILL_FLAG, "1");
    useStore.setState({ history: seeded });
  } catch {}
}

if (typeof window !== "undefined") {
  backfillHistoryFromProgress();
  window.addEventListener("storage", (e) => {
    if (e.key === "sh_watchlist") {
      useStore.setState({ watchlist: loadJSON<WatchlistItem[]>("sh_watchlist", []) });
    } else if (e.key === "sh_history") {
      useStore.setState({ history: loadJSON<HistoryItem[]>("sh_history", []) });
    } else if (e.key === "sh_progress_store") {
      useStore.setState({ progress: loadJSON<Record<string, ProgressData>>("sh_progress_store", {}) });
    } else if (e.key === "sh_user") {
      const newUser = loadJSON<User | null>("sh_user", null);
      if (!newUser) {
        useStore.setState({
          user: null,
          profilePanelOpen: false,
          logoutConfirmOpen: false,
          watchlist: [],
          history: [],
          progress: {},
        });
      } else {
        useStore.setState({
          user: newUser,
          watchlist: loadJSON<WatchlistItem[]>("sh_watchlist", []),
          history: loadJSON<HistoryItem[]>("sh_history", []),
          progress: loadJSON<Record<string, ProgressData>>("sh_progress_store", {}),
        });
      }
    }
  });
  window.addEventListener("sh-sync-complete", () => {
    useStore.setState({
      watchlist: loadJSON<WatchlistItem[]>("sh_watchlist", []),
      history: loadJSON<HistoryItem[]>("sh_history", []),
      progress: loadJSON<Record<string, ProgressData>>("sh_progress_store", {}),
    });
    window.dispatchEvent(new Event("playback-progress-updated"));
  });
  window.addEventListener("sh-profile-updated", (e: Event) => {
    const custom = e as CustomEvent<User>;
    if (custom.detail) {
      useStore.setState({ user: custom.detail });
    } else {
      useStore.setState({ user: loadJSON<User | null>("sh_user", null) });
    }
  });
  window.addEventListener("sh-session-expired", () => {
    useStore.getState().logout();
  });
}
