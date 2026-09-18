"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { showToast } from "@/components/Toast";
import CustomSelect from "./CustomSelect";
import { getStreams, getDetail, getTorrents, IMG } from "@/lib/api";
import { CFG } from "@/lib/config";
import { scheduleCloudPush } from "@/lib/sync";
import type { ProgressData, TorrentSource, StreamMode } from "@/lib/types";
import type Hls from "hls.js";

let hlsPromise: Promise<typeof import("hls.js").default> | null = null;
function loadHls(): Promise<typeof import("hls.js").default> {
  hlsPromise ||= import("hls.js").then((m) => m.default);
  return hlsPromise;
}

/* ================================================================
   Types
================================================================ */
interface StreamSource {
  url: string;
  format?: string;
  quality?: number | string;
  provider?: string;
  language?: string;
  [key: string]: unknown;
}

interface ServerGroup {
  id: string;
  name: string;
  format: string;
  provider: string;
  lang: string;
  variants: { streamIdx: number; quality: number; label: string }[];
  defaultStreamIdx: number;
}

/* ================================================================
   Constants
================================================================ */
const DEAD_HOSTS = ["cf.streamflixserver.site", "streamflixserver.site"];
const VERIFIED_FILE_HOSTS = [
  "pixeldrain.dev", "pixeldrain.com",
  "video-downloads.googleusercontent.com", "googleusercontent.com",
];
const PROGRESS_SAVE_INTERVAL_MS = 5000;

const HLS_CONFIG = {
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  maxBufferSize: 60 * 1000 * 1000,
  backBufferLength: 30,
  enableWorker: true,
  lowLatencyMode: false,
  startLevel: -1,
};

const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const aspects = [
  { value: "auto", label: "Auto (Original Fit)" },
  { value: "16:9", label: "16:9 Widescreen" },
  { value: "4:3", label: "4:3 Standard" },
  { value: "cover", label: "Fill Screen (Crop Black Bars)" },
  { value: "stretch", label: "Stretch to Fit" },
];

/* ================================================================
   Helpers — ported from legacy Player object in script.js
================================================================ */
function getStreamProvider(s: StreamSource): string {
  if (s.provider) return s.provider;
  const u = (s.url || "").toLowerCase();
  if (u.includes("vidlink")) return "VidLink";
  if (u.includes("vidsrc")) return "VidSrc";
  if (u.includes("febbox") || u.includes("showbox")) return "FebBox";
  if (u.includes("netmirror")) return "Netmirror";
  if (u.includes("pixeldrain")) return "Pixeldrain";
  if (u.includes("streamflix")) return "Streamflix";
  if (u.includes("google")) return "Google";
  return "Server";
}

function getStreamLanguage(s: StreamSource): string {
  if (s.language) return s.language;
  const u = (s.url || "").toLowerCase();
  if (u.includes("hindi")) return "Hindi";
  if (u.includes("tamil")) return "Tamil";
  if (u.includes("telugu")) return "Telugu";
  return "";
}

function qualityToNum(s: StreamSource): number {
  const q = s.quality;
  if (typeof q === "number") return q;
  if (typeof q === "string") {
    const n = parseInt(q, 10);
    if (!isNaN(n)) return n;
  }
  const u = (s.url || "").toLowerCase();
  if (u.includes("2160") || u.includes("4k")) return 2160;
  if (u.includes("1080")) return 1080;
  if (u.includes("720")) return 720;
  if (u.includes("480")) return 480;
  if (u.includes("360")) return 360;
  return 0;
}

function fileQualityLabel(q: number): string {
  if (q >= 2160) return "4K";
  if (q >= 1080) return "1080p";
  if (q >= 720) return "720p";
  if (q >= 480) return "480p";
  if (q >= 360) return "360p";
  return q > 0 ? `${q}p` : "Auto";
}

function isFileStream(st: StreamSource): boolean {
  if (st.format) return st.format === "mp4";
  const u = (st.url || "").toLowerCase();
  return u.includes("/api/v/chunk") || u.includes("/ts-proxy") || u.includes(".mp4") || u.includes(".mkv");
}

function detectStreamType(s: StreamSource): "mp4" | "m3u8" {
  if (s.format === "mp4") return "mp4";
  const u = (s.url || "").toLowerCase();
  if (s.format === "hls" || u.includes("/api/v/manifest") || u.includes("/m3u8-proxy") || u.includes(".m3u8")) return "m3u8";
  return "mp4";
}

function formatTime(s: number): string {
  if (!s || isNaN(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function prioritizeFileStreams(streams: StreamSource[]): StreamSource[] {
  if (!streams?.length) return [];
  const alive = streams.filter((s) => {
    const u = (s.url || "").toLowerCase();
    let upstream = u;
    const match = u.match(/[?&](?:url|d)=([^&]+)/);
    if (match) { try { upstream = decodeURIComponent(match[1]).toLowerCase(); } catch { /* noop */ } }
    return !DEAD_HOSTS.some((h) => upstream.includes(h));
  });
  const scored = alive.map((s) => {
    const u = (s.url || "").toLowerCase();
    let upstream = u;
    const match = u.match(/[?&](?:url|d)=([^&]+)/);
    if (match) { try { upstream = decodeURIComponent(match[1]).toLowerCase(); } catch { /* noop */ } }
    const isVerified = VERIFIED_FILE_HOSTS.some((h) => upstream.includes(h));
    const isFile = isFileStream(s);
    const q = qualityToNum(s);
    let score = 0;
    if (isVerified) score += 10000;
    if (isFile) score += 5000;
    score += q;
    return { stream: s, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.stream);
}

function getDirectServerGroups(streams: StreamSource[]): ServerGroup[] {
  if (!streams?.length) return [];
  const groupsByProvider: Record<string, ServerGroup[]> = {};
  const providerOrder: string[] = [];
  for (let j = 0; j < streams.length; j++) {
    const st = streams[j];
    const prov = getStreamProvider(st);
    const lang = getStreamLanguage(st);
    const baseKey = prov + (lang ? " " + lang : "");
    const isFile = isFileStream(st);
    const qNum = qualityToNum(st);
    const qLabel = fileQualityLabel(qNum);
    if (!groupsByProvider[baseKey]) { groupsByProvider[baseKey] = []; providerOrder.push(baseKey); }
    const provGroups = groupsByProvider[baseKey];
    if (isFile) {
      let targetGrp: ServerGroup | null = null;
      for (const cand of provGroups) {
        if (cand.format === "mp4" && !cand.variants.some((v) => v.quality === qNum)) { targetGrp = cand; break; }
      }
      if (!targetGrp) {
        targetGrp = { id: `direct_${j}`, name: baseKey, provider: prov, lang, format: "mp4", variants: [], defaultStreamIdx: j };
        provGroups.push(targetGrp);
      }
      targetGrp.variants.push({ streamIdx: j, quality: qNum, label: qLabel });
    } else {
      provGroups.push({ id: `direct_${j}`, name: baseKey, provider: prov, lang, format: "hls", variants: [{ streamIdx: j, quality: 0, label: "Auto" }], defaultStreamIdx: j });
    }
  }
  const allGroups: ServerGroup[] = [];
  let counter = 0;
  for (const key of providerOrder) {
    for (const grp of groupsByProvider[key]) {
      grp.variants.sort((a, b) => b.quality - a.quality);
      grp.defaultStreamIdx = grp.variants[0]?.streamIdx ?? grp.defaultStreamIdx;
      const suffix = grp.format === "mp4" && grp.variants.length > 0 ? ` (${grp.variants[0].label})` : " (HLS Auto)";
      grp.id = `direct_${counter}`;
      grp.name = `${grp.name}${suffix}`;
      allGroups.push(grp);
      counter++;
    }
  }
  return allGroups;
}

function getSavedTime(itemId: number, mediaType: string, season?: number, episode?: number): number {
  try {
    const store = JSON.parse(localStorage.getItem("sh_progress_store") || "{}");
    const key = mediaType === "tv" ? `${itemId}_s${season || 1}e${episode || 1}` : String(itemId);
    return store[key]?.currentTime || 0;
  } catch { return 0; }
}

function recordPlaybackProgress(
  itemId: number,
  mediaType: string,
  title: string,
  poster: string | null | undefined,
  currentTime: number,
  duration: number,
  season?: number,
  episode?: number,
  explicitPct?: number
) {
  if (!itemId) return;
  try {
    const isTv = mediaType === "tv";
    const s = isTv ? (season || 1) : undefined;
    const e = isTv ? (episode || 1) : undefined;
    const key = isTv ? `${itemId}_s${s}e${e}` : String(itemId);

    const store = JSON.parse(localStorage.getItem("sh_progress_store") || "{}");
    const existing = store[key] || {};

    let pct = explicitPct;
    if (pct === undefined) {
      if (duration > 0 && currentTime > 0) {
        pct = Math.min(100, Math.max(1, Math.round((currentTime / duration) * 100)));
      } else if (existing.pct) {
        pct = existing.pct;
      } else {
        pct = 2; // Initial progress so it immediately appears in Continue Watching!
      }
    }

    const itemPoster = poster || existing.poster || null;
    const itemTitle = title || existing.title || (isTv ? `Series (S${s} E${e})` : "Movie");

    store[key] = {
      id: itemId,
      type: mediaType,
      title: itemTitle,
      poster: itemPoster,
      currentTime: currentTime || existing.currentTime || 0,
      duration: duration || existing.duration || 0,
      pct,
      progress: pct,
      season: s,
      episode: e,
      updatedAt: Date.now(),
    };

    const keys = Object.keys(store);
    if (keys.length > 150) {
      let oldestKey = keys[0];
      let oldestTime = Infinity;
      for (const k of keys) {
        const t = store[k]?.updatedAt || 0;
        if (t < oldestTime) {
          oldestTime = t;
          oldestKey = k;
        }
      }
      delete store[oldestKey];
    }
    localStorage.setItem("sh_progress_store", JSON.stringify(store));

    try {
      useStore.setState({ progress: store as Record<string, ProgressData> });
    } catch {}

    try {
      const vl = JSON.parse(localStorage.getItem("vidLinkProgress") || "{}");
      if (isTv) {
        if (!vl[itemId]) vl[itemId] = { title: itemTitle, poster: itemPoster, show_progress: {} };
        if (!vl[itemId].show_progress) vl[itemId].show_progress = {};
        vl[itemId].show_progress[`s${s}e${e}`] = {
          progress: {
            watched: currentTime || (duration ? (duration * (pct || 2)) / 100 : 10),
            duration: duration || 100,
          },
          updatedAt: Date.now(),
        };
      } else {
        vl[itemId] = {
          title: itemTitle,
          poster: itemPoster,
          progress: {
            watched: currentTime || (duration ? (duration * (pct || 2)) / 100 : 10),
            duration: duration || 100,
          },
          updatedAt: Date.now(),
        };
      }
      localStorage.setItem("vidLinkProgress", JSON.stringify(vl));
    } catch {}

    try {
      useStore.getState().addToHistory({
        id: itemId,
        type: mediaType,
        title: itemTitle,
        poster: itemPoster,
        season: s,
        episode: e,
        progress: pct,
        updatedAt: Date.now(),
      });
    } catch {}

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("playback-progress-updated"));
    }
  } catch {
    /* noop */
  }
}

function getStoredStreamMode(): StreamMode {
  try {
    const raw = localStorage.getItem("cinecub_stream_mode") || localStorage.getItem("streamheaven_stream_mode");
    if (raw === "torrent" || raw === '"torrent"') return "torrent";
    // Always default to "cloud" so opening any title plays instantly in-browser
    return "cloud";
  } catch {
    return "cloud";
  }
}

function getProviderBadgeClass(provider: string): string {
  const p = (provider || "").toLowerCase();
  if (p.includes("1337")) return "prov-1337x";
  if (p.includes("pirate") || p.includes("tpb")) return "prov-tpb";
  if (p.includes("yts")) return "prov-yts";
  if (p.includes("bitsearch")) return "prov-bitsearch";
  if (p.includes("torrentscsv") || p.includes("csv") || p.includes("opentorrents")) return "prov-torrentscsv";
  if (p.includes("animetosho") || p.includes("anidex") || p.includes("tokyotosho")) return "prov-animetosho";
  if (p.includes("galaxy") || p.includes("tgx")) return "prov-tgx";
  if (p.includes("nyaa")) return "prov-nyaa";
  if (p.includes("eztv")) return "prov-eztv";
  if (p.includes("rarbg")) return "prov-rarbg";
  if (p.includes("rutracker")) return "prov-rutracker";
  if (p.includes("rutor")) return "prov-rutor";
  if (p.includes("kickass") || p.includes("kat")) return "prov-kat";
  if (p.includes("magnetdl")) return "prov-magnetdl";
  if (p.includes("horrible")) return "prov-horriblesubs";
  if (p.includes("wolfmax")) return "prov-wolfmax";
  if (p.includes("cinecalidad")) return "prov-cinecalidad";
  if (p.includes("comando") || p.includes("bludv") || p.includes("coleao")) return "prov-latam";
  if (p.includes("torrent9") || p.includes("corsaro") || p.includes("mejortorrent")) return "prov-euro";
  return "prov-default";
}

/* ================================================================
   Built-In Addon Providers
================================================================ */
const BUILTIN_ADDONS = [
  { id: "torrentio", name: "Torrentio", desc: "TPB, 1337x, YTS, RARBG", type: "Multi-Index" },
  { id: "knightcrawler", name: "KnightCrawler", desc: "ElfHosted Fast DHT", type: "Fast DHT" },
  { id: "tpb", name: "ThePirateBay", desc: "Decentralized Indexer", type: "P2P Archive" },
  { id: "comet", name: "Comet", desc: "Debrid & P2P Aggregator", type: "Aggregator" },
  { id: "mediafusion", name: "MediaFusion", desc: "Multi-Language Scraper", type: "Multi-Lang" },
  { id: "bitsearch", name: "Bitsearch", desc: "Verified DHT Indexer", type: "DHT Index" },
  { id: "nyaa", name: "Nyaa & Tosho", desc: "Anime & Raw Releases", type: "Anime" },
  { id: "eztv", name: "EZTV", desc: "TV Episode Specialist", type: "TV Shows" },
];

/* ================================================================
   PlayerModal Component
================================================================ */
export default function PlayerModal() {
  const { playerModal, closePlayer, openPlayer } = useStore(
    useShallow((s) => ({
      playerModal: s.playerModal,
      closePlayer: s.closePlayer,
      openPlayer: s.openPlayer,
    }))
  );

  const [streamMode, setStreamMode] = useState<StreamMode>(() => getStoredStreamMode());
  const [directStreams, setDirectStreams] = useState<StreamSource[]>([]);
  const [torrentStreams, setTorrentStreams] = useState<TorrentSource[]>([]);
  const [selectedTorrentIdx, setSelectedTorrentIdx] = useState(0);
  const [loadingTorrents, setLoadingTorrents] = useState(false);
  const [activeTorrentMagnet, setActiveTorrentMagnet] = useState("");
  const [showTorrentHub, setShowTorrentHub] = useState(true);
  const [qualityFilter, setQualityFilter] = useState<"all" | "4k" | "1080p" | "720p">("all");
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);
  const [customMagnet, setCustomMagnet] = useState("");
  const [showMagnetModal, setShowMagnetModal] = useState(false);
  const [magnetInput, setMagnetInput] = useState("");
  const [torrentSearchQuery, setTorrentSearchQuery] = useState("");
  const [customAddons, setCustomAddons] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(localStorage.getItem("cinecub_custom_addons") || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });
  const [addonInput, setAddonInput] = useState("");
  const [serverGroups, setServerGroups] = useState<ServerGroup[]>([]);
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [embedServerIdx, setEmbedServerIdx] = useState(0);
  const [reloadSeq, setReloadSeq] = useState(0);

  const [seasonsList, setSeasonsList] = useState<{ season_number: number; episode_count: number }[]>([]);

  const [loading, setLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<"main" | "speed" | "audio" | "subsync" | "aspect">("main");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [aspectRatio, setAspectRatio] = useState("auto");
  const [ccEnabled, setCcEnabled] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const upNextCountdown = 10;

  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const timelinePlayedRef = useRef<HTMLDivElement>(null);
  const timelineTooltipRef = useRef<HTMLDivElement>(null);
  const timeCurrentRef = useRef<HTMLSpanElement>(null);
  const timeDurationRef = useRef<HTMLSpanElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const serverGroupsRef = useRef<ServerGroup[]>([]);
  const activeGroupIdxRef = useRef<number>(0);
  const directStreamsRef = useRef<StreamSource[]>([]);
  const progressSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handleDirectStreamErrorRef = useRef<() => void>(() => {});
  const handleSetStreamModeRef = useRef<(mode: StreamMode) => void>(() => {});

  const mediaTitle = playerModal?.title || "";
  const mediaSeason = playerModal?.season;
  const mediaEpisode = playerModal?.episode;
  const isExplicitTv = Boolean(
    mediaSeason !== undefined ||
    mediaEpisode !== undefined ||
    playerModal?.type === "tv" ||
    playerModal?.type === "anime"
  );
  const mediaType = isExplicitTv ? "tv" : (playerModal?.type || "movie");
  const mediaId = playerModal?.id;
  const curSeason = mediaSeason || 1;
  const curEpisode = mediaEpisode || 1;

  const historyPoster = useStore((s) => (mediaId ? s.history.find((h) => h.id === mediaId)?.poster : undefined));
  const [fetchedPoster, setFetchedPoster] = useState<string | null>(null);
  const currentPoster = playerModal?.poster || historyPoster || fetchedPoster;

  useEffect(() => {
    if (playerModal?.poster || historyPoster || !mediaId) return;
    let cancelled = false;
    getDetail(mediaId, mediaType)
      .then((d) => {
        if (!cancelled && d?.poster_path) setFetchedPoster(d.poster_path);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mediaId, mediaType, playerModal?.poster, historyPoster]);

  // Record playback progress immediately so title appears in Continue Watching right away
  useEffect(() => {
    if (!mediaId) return;
    const s = mediaType === "tv" ? curSeason : undefined;
    const e = mediaType === "tv" ? curEpisode : undefined;
    const savedTime = getSavedTime(mediaId, mediaType, s, e);
    recordPlaybackProgress(
      mediaId,
      mediaType,
      mediaTitle,
      currentPoster,
      savedTime,
      0,
      s,
      e
    );
  }, [mediaId, mediaType, mediaTitle, currentPoster, curSeason, curEpisode]);

  // Listen to message events from Cloud Stream embed iframes (e.g. VidLink PLAYER_EVENT)
  useEffect(() => {
    if (!mediaId) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "PLAYER_EVENT") {
        const { currentTime: ct, duration: dur } = event.data.data || {};
        if (typeof ct === "number" && dur > 0) {
          const s = mediaType === "tv" ? curSeason : undefined;
          const e = mediaType === "tv" ? curEpisode : undefined;
          recordPlaybackProgress(mediaId, mediaType, mediaTitle, currentPoster, ct, dur, s, e);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [mediaId, mediaType, mediaTitle, currentPoster, curSeason, curEpisode]);

  const lastSaveRef = useRef<number>(0);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !mediaId) return;
    const ct = video.currentTime;
    const dur = video.duration || 0;

    // Direct DOM updates: 60fps smooth timeline with ZERO React re-render overhead
    if (timelinePlayedRef.current && dur > 0) {
      const pct = Math.min(100, Math.max(0, (ct / dur) * 100));
      timelinePlayedRef.current.style.width = `${pct}%`;
    }
    if (timeCurrentRef.current) {
      timeCurrentRef.current.textContent = formatTime(ct);
    }
    if (timeDurationRef.current && dur > 0) {
      timeDurationRef.current.textContent = formatTime(dur);
    }

    // Only update duration state if it actually changed
    setDuration((prev) => (Math.abs(prev - dur) > 0.5 ? dur : prev));

    if (typeof navigator !== "undefined" && "mediaSession" in navigator && "setPositionState" in navigator.mediaSession && dur > 0 && !isNaN(dur)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: video.playbackRate || 1,
          position: Math.min(ct, dur),
        });
      } catch {}
    }

    const now = Date.now();
    if (now - lastSaveRef.current >= 4000 && dur > 0 && ct > 0) {
      lastSaveRef.current = now;
      const s = mediaType === "tv" ? curSeason : undefined;
      const e = mediaType === "tv" ? curEpisode : undefined;
      recordPlaybackProgress(mediaId, mediaType, mediaTitle, currentPoster, ct, dur, s, e);
    }
    if (mediaType === "tv" && dur > 30) {
      const timeLeft = dur - ct;
      if (timeLeft <= 15 && timeLeft > 1) {
        setShowUpNext(true);
      } else if (timeLeft > 15) {
        setShowUpNext(false);
      }
    }
  }, [mediaId, mediaType, mediaTitle, currentPoster, curSeason, curEpisode]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.changedTouches[0];
    if (!touch || !containerRef.current) return;
    const now = Date.now();
    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const isLeft = x < rect.width / 2;
    if (lastTapRef.current && now - lastTapRef.current.time < 350 && Math.abs(x - lastTapRef.current.x) < 80) {
      if (videoRef.current) {
        if (isLeft) {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
          showToast("⏪ -10s", "info");
        } else {
          videoRef.current.currentTime = Math.min(videoRef.current.duration || 999999, videoRef.current.currentTime + 10);
          showToast("⏩ +10s", "info");
        }
      }
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { time: now, x };
    }
  }, []);

  useEffect(() => {
    if (!mediaId || mediaType !== "tv") return;
    let cancelled = false;
    getDetail(mediaId, "tv")
      .then((data) => {
        if (cancelled) return;
        const valid = (data?.seasons || []).filter((s: { season_number: number; episode_count: number }) => s.season_number >= 0);
        setSeasonsList(valid.length > 0 ? valid : [{ season_number: 1, episode_count: 24 }]);
      })
      .catch(() => {
        if (!cancelled) setSeasonsList([{ season_number: 1, episode_count: 24 }]);
      });
    return () => {
      cancelled = true;
      setSeasonsList([]);
    };
  }, [mediaId, mediaType]);

  const cleanupHls = useCallback(() => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } }, []);
  const stopProgressSave = useCallback(() => { if (progressSaveTimerRef.current) { clearInterval(progressSaveTimerRef.current); progressSaveTimerRef.current = null; } }, []);

  const stopVideo = useCallback(() => {
    cleanupHls(); stopProgressSave();
    setIsBuffering(false);
    const video = videoRef.current;
    if (video) { try { video.pause(); } catch {} try { video.removeAttribute("src"); video.load(); } catch {} }
    const wContainer = document.getElementById("webtor-player-target");
    if (wContainer) {
      wContainer.innerHTML = "";
    }
  }, [cleanupHls, stopProgressSave]);

  const copyMagnet = useCallback((magnetUrl: string) => {
    if (!magnetUrl) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(magnetUrl)
        .then(() => {
          showToast("🧲 Magnet link copied to clipboard!", "success");
        })
        .catch(() => {
          showToast("🧲 Magnet: " + magnetUrl.slice(0, 32) + "...", "info");
        });
    } else {
      showToast("🧲 Magnet: " + magnetUrl.slice(0, 32) + "...", "info");
    }
  }, []);

  const mountWebtor = useCallback((magnetUrl: string) => {
    if (!magnetUrl) return;
    setActiveTorrentMagnet(magnetUrl);
    setShowTorrentHub(false);
    setLoading(false);
    setError(false);
    showToast("▶ Playing stream directly via Personal Watch", "success");
  }, []);

  const refreshTorrents = useCallback(() => {
    if (!playerModal) return;
    setLoadingTorrents(true);
    getTorrents(playerModal.id, playerModal.type, playerModal.season, playerModal.episode, customAddons)
      .then((torrents) => {
        setTorrentStreams(torrents);
        setLoadingTorrents(false);
        showToast(`⚡ Discovered ${torrents.length} torrent streams across ${BUILTIN_ADDONS.length + customAddons.length} providers`, "success");
      })
      .catch((err) => {
        console.warn("[PlayerModal] Failed to refresh torrents:", err);
        setLoadingTorrents(false);
        showToast("Could not refresh torrents", "error");
      });
  }, [playerModal, customAddons]);

  const handleAddCustomAddon = useCallback(() => {
    const trimmed = addonInput.trim();
    if (!trimmed) {
      showToast("Please enter a Stremio addon manifest URL", "error");
      return;
    }
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      showToast("URL must start with http:// or https://", "error");
      return;
    }
    if (customAddons.includes(trimmed)) {
      showToast("This addon is already installed", "info");
      return;
    }
    const updated = [...customAddons, trimmed];
    setCustomAddons(updated);
    try {
      localStorage.setItem("cinecub_custom_addons", JSON.stringify(updated));
    } catch {}
    setAddonInput("");
    showToast("🧩 Custom addon added successfully!", "success");
    if (playerModal) {
      setLoadingTorrents(true);
      getTorrents(playerModal.id, playerModal.type, playerModal.season, playerModal.episode, updated)
        .then((torrents) => {
          setTorrentStreams(torrents);
          setLoadingTorrents(false);
          showToast(`⚡ Discovered ${torrents.length} streams with new addon`, "success");
        })
        .catch(() => setLoadingTorrents(false));
    }
  }, [addonInput, customAddons, playerModal]);

  const handleRemoveCustomAddon = useCallback((url: string) => {
    const updated = customAddons.filter((a) => a !== url);
    setCustomAddons(updated);
    try {
      localStorage.setItem("cinecub_custom_addons", JSON.stringify(updated));
    } catch {}
    showToast("Addon removed", "info");
    if (playerModal) {
      setLoadingTorrents(true);
      getTorrents(playerModal.id, playerModal.type, playerModal.season, playerModal.episode, updated)
        .then((torrents) => {
          setTorrentStreams(torrents);
          setLoadingTorrents(false);
        })
        .catch(() => setLoadingTorrents(false));
    }
  }, [customAddons, playerModal]);

  const handleTorrentFile = useCallback(async (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".torrent")) {
      showToast("Please select a valid .torrent file", "error");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const u8 = new Uint8Array(buf);
      const str = Array.from(u8, (b) => String.fromCharCode(b)).join("");
      const infoPos = str.indexOf("4:info");
      if (infoPos !== -1) {
        const infoBytes = u8.slice(infoPos + 6, u8.length - 1);
        const hashBuf = await crypto.subtle.digest("SHA-1", infoBytes);
        const hashHex = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const magnet = `magnet:?xt=urn:btih:${hashHex}&dn=${encodeURIComponent(file.name.replace(/\.torrent$/i, ""))}`;
        setCustomMagnet(magnet);
        mountWebtor(magnet);
        showToast(`🧲 Loaded ${file.name} via Personal Watch`, "success");
        return;
      }
      showToast("Could not parse info hash from .torrent file", "error");
    } catch (err) {
      console.warn("Torrent file parse error:", err);
      showToast("Failed to parse .torrent file", "error");
    }
  }, [mountWebtor]);

  const getEmbedUrl = useCallback((idx: number) => {
    const server = CFG.SERVERS[idx] || CFG.SERVERS[0];
    return server.url(mediaId || 0, mediaType, mediaSeason || 1, mediaEpisode || 1);
  }, [mediaId, mediaType, mediaSeason, mediaEpisode]);

  const handleNextEmbedServer = useCallback(() => {
    const nextIdx = (embedServerIdx + 1) % CFG.SERVERS.length;
    setEmbedServerIdx(nextIdx);
    setLoading(true);
    showToast(`☁️ Switched to ${CFG.SERVERS[nextIdx].name}`, "info");
  }, [embedServerIdx]);

  // Safety auto-dismiss for Cloud Stream embed: dismiss loading overlay after 2.4s so slow third-party assets don't block user
  useEffect(() => {
    if (!playerModal || streamMode !== "cloud") return;
    setLoading(true);
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2400);
    return () => clearTimeout(timer);
  }, [playerModal?.id, playerModal?.season, playerModal?.episode, embedServerIdx, streamMode]);

  const handleSetStreamMode = useCallback((mode: StreamMode) => {
    stopVideo();
    setIsBuffering(false);
    setStreamMode(mode);
    try {
      if (mode === "cloud" || mode === "direct") {
        localStorage.setItem("cinecub_stream_mode", mode);
      }
      useStore.getState().setStreamMode(mode);
    } catch {}
    if (mode === "direct") {
      if (directStreams.length > 0) {
        showToast("⚡ Direct Stream: Native player matching website vibe", "success");
        setLoading(false);
      } else {
        showToast("⚡ Finding direct streams...", "info");
        setLoading(true);
        setReloadSeq((s) => s + 1);
      }
    } else if (mode === "torrent") {
      showToast("🧲 Switched to Personal Watch", "success");
      if (customMagnet) {
        mountWebtor(customMagnet);
      } else if (activeTorrentMagnet) {
        setShowTorrentHub(false);
        setLoading(false);
      } else {
        setShowTorrentHub(true);
        setLoading(false);
      }
    } else {
      showToast("☁️ Cloud Stream: Switched to Cloud Embed Servers", "info");
      setLoading(false);
    }
  }, [directStreams, stopVideo, customMagnet, activeTorrentMagnet, mountWebtor]);

  const handleDirectStreamError = useCallback(async () => {
    console.warn("[PlayerModal] Direct stream playback error encountered");
    const groups = serverGroupsRef.current;
    const curIdx = activeGroupIdxRef.current;
    const nextIdx = curIdx + 1;

    // Try next direct server group within Direct Stream mode if available
    if (groups && nextIdx < groups.length) {
      const nextGroup = groups[nextIdx];
      const s = directStreamsRef.current[nextGroup.defaultStreamIdx];
      if (s?.url) {
        showToast(`⚡ Trying next direct server: ${nextGroup.name}`, "info");
        activeGroupIdxRef.current = nextIdx;
        setActiveGroupIdx(nextIdx);
        const video = videoRef.current;
        if (video) {
          cleanupHls();
          setLoading(true);
          setIsBuffering(false);
          setError(false);
          const streamType = detectStreamType(s);
          const curTime = video.currentTime || 0;
          if (streamType === "m3u8") {
            const Hls = await loadHls();
            if (Hls.isSupported()) {
              const hls = new Hls(HLS_CONFIG);
              hlsRef.current = hls;
              hls.loadSource(s.url);
              hls.attachMedia(video);
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (curTime > 0) video.currentTime = curTime;
                video.play().catch(() => {});
                setLoading(false);
                setIsBuffering(false);
              });
              hls.on(Hls.Events.ERROR, (_: unknown, d: { fatal?: boolean }) => {
                if (d.fatal) handleDirectStreamErrorRef.current();
              });
            } else {
              video.src = s.url;
              video.load();
              if (curTime > 0) video.currentTime = curTime;
              video.play().catch(() => {});
              setLoading(false);
              setIsBuffering(false);
            }
          } else {
            video.src = s.url;
            video.load();
            if (curTime > 0) video.currentTime = curTime;
            video.play().catch(() => {});
            setLoading(false);
            setIsBuffering(false);
          }
        }
        return;
      }
    }

    // All direct servers exhausted or unavailable: keep user in direct stream mode with error UI
    cleanupHls();
    setError(true);
    setLoading(false);
    setIsBuffering(false);
    showToast("⚠️ Direct stream unavailable. Select another server or retry.", "error");
  }, [cleanupHls]);

  useEffect(() => {
    handleDirectStreamErrorRef.current = handleDirectStreamError;
  }, [handleDirectStreamError]);

  useEffect(() => {
    handleSetStreamModeRef.current = handleSetStreamMode;
  }, [handleSetStreamMode]);

  /* Torrent fetching effect */
  useEffect(() => {
    if (!playerModal) {
      setTorrentStreams([]);
      setSelectedTorrentIdx(0);
      setCustomMagnet("");
      setActiveTorrentMagnet("");
      setShowTorrentHub(false);
      return;
    }
    let cancelled = false;
    setLoadingTorrents(true);

    getTorrents(playerModal.id, playerModal.type, playerModal.season, playerModal.episode)
      .then((torrents) => {
        if (cancelled) return;
        setTorrentStreams(torrents);
        setSelectedTorrentIdx(0);
        setLoadingTorrents(false);
        if (torrents.length > 0 && !activeTorrentMagnet) {
          setActiveTorrentMagnet(torrents[0].magnet);
        }
        if (streamMode === "torrent") {
          setShowTorrentHub(false);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[PlayerModal] Failed to fetch torrents:", err);
          setLoadingTorrents(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [playerModal?.id, playerModal?.type, playerModal?.season, playerModal?.episode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Main effect: fetch streams */
  useEffect(() => {
    if (!playerModal) return;
    const id = playerModal.id;
    const type = playerModal.type;
    const season = playerModal.season;
    const episode = playerModal.episode;

    let cancelled = false;
    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    const timer = setTimeout(() => {
      if (cancelled) return;
      const mode = getStoredStreamMode();
      setStreamMode(mode);

      if (mode === "cloud" || mode === "torrent") {
        setLoading(false);
        return;
      }

      setLoading(true);
      setIsBuffering(false);
      setError(false);
      setShowSettings(false);
      setSettingsPanel("main");
      setShowUpNext(false);

      (async () => {
        try {
          const data = await getStreams(id, type, season, episode);
          if (cancelled) return;
          const rawStreams: StreamSource[] = (data?.streams || data?.results || (Array.isArray(data) ? data : [])) as StreamSource[];
          if (rawStreams.length === 0) {
            setDirectStreams([]);
            setServerGroups([]);
            console.info("[PlayerModal] Direct stream server offline, auto-switching to Cloud Stream");
            showToast("⚡ Direct server offline — switched to Cloud Stream", "info");
            handleSetStreamModeRef.current("cloud");
            return;
          }

          const sorted = prioritizeFileStreams(rawStreams);
          setDirectStreams(sorted);
          directStreamsRef.current = sorted;
          const groups = getDirectServerGroups(sorted);
          setServerGroups(groups);
          serverGroupsRef.current = groups;
          setActiveGroupIdx(0);
          activeGroupIdxRef.current = 0;

          const s = sorted[0];
          if (!s?.url) {
            showToast("⚡ Direct stream server is offline (Render suspended)", "info");
            setLoading(false);
            return;
          }

          const video = videoRef.current;
          if (!video) return;

          const streamType = detectStreamType(s);
          const resumeAt = getSavedTime(id, type, season, episode);

          const signal = abortCtrl.signal;
          const onCanPlay = () => {
            if (resumeAt > 0) video.currentTime = resumeAt;
            video.play().catch(() => {});
            setLoading(false);
            setIsBuffering(false);
          };
          const handleError = () => {
            console.warn("[PlayerModal] Native error on direct stream");
            handleDirectStreamError();
          };

          video.addEventListener("canplay", onCanPlay, { signal, once: true });
          video.addEventListener("error", handleError, { signal, once: true });
          video.addEventListener("waiting", () => setIsBuffering(true), { signal });
          video.addEventListener("playing", () => { setIsBuffering(false); setLoading(false); }, { signal });
          video.addEventListener("timeupdate", () => setIsBuffering(false), { signal });

          if (streamType === "m3u8") {
            const Hls = await loadHls();
            if (cancelled) return;
            if (Hls.isSupported()) {
              cleanupHls();
              const hls = new Hls(HLS_CONFIG);
              hlsRef.current = hls;
              hls.loadSource(s.url);
              hls.attachMedia(video);
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (resumeAt > 0) video.currentTime = resumeAt;
                video.play().catch(() => {});
                setLoading(false);
                setIsBuffering(false);
              });
              hls.on(Hls.Events.ERROR, (_: unknown, d: { fatal?: boolean }) => {
                if (d.fatal) handleError();
              });
            } else {
              video.src = s.url;
              video.load();
            }
          } else {
            video.src = s.url;
            video.load();
          }

          if (progressSaveTimerRef.current) clearInterval(progressSaveTimerRef.current);
          progressSaveTimerRef.current = setInterval(() => {
            if (video && video.duration > 0 && !video.paused) {
              const sNum = type === "tv" ? (season || 1) : undefined;
              const eNum = type === "tv" ? (episode || 1) : undefined;
              recordPlaybackProgress(id, type, playerModal?.title || "", currentPoster, video.currentTime, video.duration, sNum, eNum);
            }
          }, PROGRESS_SAVE_INTERVAL_MS);
        } catch (err) {
          if (!cancelled) {
            console.error("[PlayerModal] Stream fetch error:", err);
            setDirectStreams([]);
            setServerGroups([]);
            showToast("⚡ Direct server offline — switched to Cloud Stream", "info");
            handleSetStreamModeRef.current("cloud");
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      abortCtrl.abort();
      if (progressSaveTimerRef.current) clearInterval(progressSaveTimerRef.current);
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [playerModal, reloadSeq, currentPoster, cleanupHls, handleDirectStreamError]);

  useEffect(() => {
    if (!playerModal) return;
    return () => {
      stopVideo();
    };
  }, [playerModal, stopVideo]);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFullscreen = useCallback(() => { if (!containerRef.current) return; if (document.fullscreenElement) document.exitFullscreen(); else containerRef.current.requestFullscreen(); }, []);
  const togglePlay = useCallback(() => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play(); setIsPlaying(true); } else { v.pause(); setIsPlaying(false); } }, []);
  const toggleMute = useCallback(() => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setIsMuted(v.muted); }, []);
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const v = videoRef.current; if (!v) return; const val = parseFloat(e.target.value); v.volume = val; setVolume(val); if (val === 0) { v.muted = true; setIsMuted(true); } else if (v.muted) { v.muted = false; setIsMuted(false); } }, []);
  const isSeekingRef = useRef(false);

  const seekFromClientX = useCallback((clientX: number, commit: boolean) => {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const dur = v?.duration || 0;
    const targetTime = dur > 0 ? pct * dur : 0;
    if (timelinePlayedRef.current) {
      timelinePlayedRef.current.style.width = `${pct * 100}%`;
    }
    if (timeCurrentRef.current && dur > 0) {
      timeCurrentRef.current.textContent = formatTime(targetTime);
    }
    if (timelineTooltipRef.current) {
      timelineTooltipRef.current.textContent = formatTime(targetTime);
      timelineTooltipRef.current.style.left = `${pct * 100}%`;
    }
    if (commit && v) {
      v.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isSeekingRef.current = true;
    if (progressRef.current) progressRef.current.classList.add("dragging");
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    seekFromClientX(e.clientX, true);
  }, [seekFromClientX]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isSeekingRef.current) {
      seekFromClientX(e.clientX, true);
    } else {
      const bar = progressRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const dur = videoRef.current?.duration || 0;
      if (timelineTooltipRef.current && dur > 0) {
        timelineTooltipRef.current.textContent = formatTime(pct * dur);
        timelineTooltipRef.current.style.left = `${pct * 100}%`;
      }
    }
  }, [seekFromClientX]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isSeekingRef.current) {
      isSeekingRef.current = false;
      if (progressRef.current) progressRef.current.classList.remove("dragging");
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      seekFromClientX(e.clientX, true);
    }
  }, [seekFromClientX]);

  const togglePiP = useCallback(async () => { const v = videoRef.current; if (!v) return; try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); } catch { showToast("Picture-in-Picture not supported", "error"); } }, []);

  // curSeason and curEpisode already declared above (lines 353-354)
  const currentSeasonInfo = seasonsList.find((s) => s.season_number === curSeason);
  const maxEpisodes = currentSeasonInfo?.episode_count || 24;

  const handleClose = useCallback(() => {
    const video = videoRef.current;
    if (video && video.duration > 0 && mediaId) {
      const s = mediaType === "tv" ? curSeason : undefined;
      const e = mediaType === "tv" ? curEpisode : undefined;
      recordPlaybackProgress(mediaId, mediaType, mediaTitle, currentPoster, video.currentTime, video.duration, s, e);
    }
    stopVideo();
    closePlayer();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("playback-progress-updated"));
    }
  }, [mediaId, mediaType, mediaTitle, currentPoster, curSeason, curEpisode, stopVideo, closePlayer]);

  // Flush playback progress on unmount so no watch progress is lost
  useEffect(() => {
    const video = videoRef.current;
    return () => {
if (video && video.duration > 0 && mediaId) {
        const s = mediaType === "tv" ? curSeason : undefined;
        const e = mediaType === "tv" ? curEpisode : undefined;
        recordPlaybackProgress(mediaId, mediaType, mediaTitle, currentPoster, video.currentTime, video.duration, s, e);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("playback-progress-updated"));
        }
        scheduleCloudPush();
      }
    };
  }, [mediaId, mediaType, mediaTitle, currentPoster, curSeason, curEpisode]);

  const handleSeasonChange = useCallback((newSeason: number) => {
    if (!playerModal) return;
    openPlayer(playerModal.id, "tv", playerModal.title, newSeason, 1, currentPoster || undefined);
  }, [playerModal, currentPoster, openPlayer]);

  const handleEpisodeChange = useCallback((newEpisode: number) => {
    if (!playerModal) return;
    openPlayer(playerModal.id, "tv", playerModal.title, mediaSeason || 1, newEpisode, currentPoster || undefined);
  }, [playerModal, mediaSeason, currentPoster, openPlayer]);

  const handlePrevEpisode = useCallback(() => {
    if (!playerModal || mediaType !== "tv") return;
    const s = mediaSeason || 1;
    const e = mediaEpisode || 1;
    if (e <= 1) {
      const prevSeasonObj = seasonsList
        .filter((item) => item.season_number < s)
        .sort((a, b) => b.season_number - a.season_number)[0];
      if (prevSeasonObj) {
        showToast(`Switching to Season ${prevSeasonObj.season_number}`, "info");
        openPlayer(playerModal.id, "tv", playerModal.title, prevSeasonObj.season_number, prevSeasonObj.episode_count || 1, currentPoster || undefined);
      } else {
        showToast("You are at the very first episode!", "info");
      }
    } else {
      openPlayer(playerModal.id, "tv", playerModal.title, s, e - 1, currentPoster || undefined);
    }
  }, [playerModal, mediaType, mediaSeason, mediaEpisode, seasonsList, currentPoster, openPlayer]);

  const handleNextEpisode = useCallback(() => {
    if (!playerModal || mediaType !== "tv") return;
    const s = mediaSeason || 1;
    const e = mediaEpisode || 1;
    if (e >= maxEpisodes) {
      const nextSeasonObj = seasonsList
        .filter((item) => item.season_number > s)
        .sort((a, b) => a.season_number - b.season_number)[0];
      if (nextSeasonObj) {
        showToast(`Switching to Season ${nextSeasonObj.season_number}`, "info");
        openPlayer(playerModal.id, "tv", playerModal.title, nextSeasonObj.season_number, 1, currentPoster || undefined);
      } else {
        showToast("You have reached the final episode!", "info");
      }
    } else {
      openPlayer(playerModal.id, "tv", playerModal.title, s, e + 1, currentPoster || undefined);
    }
  }, [playerModal, mediaType, mediaSeason, mediaEpisode, maxEpisodes, seasonsList, currentPoster, openPlayer]);

  const handleShare = useCallback(() => {
    if (!mediaId) return;
    const isTv = mediaType === "tv";
    const shareUrl = isTv
      ? `https://cinecub.stream/?id=${mediaId}&type=tv&s=${curSeason}&e=${curEpisode}`
      : `https://cinecub.stream/?id=${mediaId}&type=${mediaType}`;
    const epText = isTv ? ` S${curSeason}:E${curEpisode}` : "";
    const shareData = {
      title: `${mediaTitle}${epText} - Watch Free in HD on CineCub`,
      text: `Stream ${mediaTitle}${epText} free in Full HD/4K on CineCub:`,
      url: shareUrl,
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {
        navigator.clipboard?.writeText(shareUrl).then(() => showToast("Episode link copied to clipboard!", "success")).catch(() => {});
      });
    } else {
      navigator.clipboard?.writeText(shareUrl).then(() => showToast("Episode link copied to clipboard!", "success")).catch(() => {});
    }
  }, [mediaId, mediaType, curSeason, curEpisode, mediaTitle]);

  // Media Session API for mobile lock screen, smartwatch, and Bluetooth controls
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    if (!mediaId || !mediaTitle) return;

    const isTv = mediaType === "tv";
    const titleText = isTv ? `${mediaTitle} - S${curSeason}:E${curEpisode}` : mediaTitle;
    const artworkList = currentPoster
      ? [
          { src: IMG.poster(currentPoster, "w342") || "", sizes: "342x513", type: "image/jpeg" },
          { src: IMG.poster(currentPoster, "w780") || "", sizes: "780x1170", type: "image/jpeg" },
        ]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: titleText,
      artist: "CineCub",
      album: isTv ? `Season ${curSeason}` : "CineCub Cinema",
      artwork: artworkList,
    });

    const setAction = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    };

    setAction("play", () => {
      videoRef.current?.play().catch(() => {});
    });
    setAction("pause", () => {
      videoRef.current?.pause();
    });
    setAction("seekbackward", (details) => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - (details.seekOffset || 10));
      }
    });
    setAction("seekforward", (details) => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.min(videoRef.current.duration || 999999, videoRef.current.currentTime + (details.seekOffset || 10));
      }
    });
    setAction("seekto", (details) => {
      if (videoRef.current && details.seekTime !== undefined) {
        videoRef.current.currentTime = details.seekTime;
      }
    });

    if (isTv) {
      setAction("previoustrack", () => handlePrevEpisode());
      setAction("nexttrack", () => handleNextEpisode());
    } else {
      setAction("previoustrack", null);
      setAction("nexttrack", null);
    }

    return () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = null;
      }
    };
  }, [mediaId, mediaTitle, mediaType, curSeason, curEpisode, currentPoster, handlePrevEpisode, handleNextEpisode]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!playerModal) return; if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.shiftKey && e.key.toLowerCase() === "p") {
        if (mediaType === "tv") { e.preventDefault(); handlePrevEpisode(); }
        return;
      }
      switch (e.key.toLowerCase()) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "f": e.preventDefault(); toggleFullscreen(); break;
        case "m": e.preventDefault(); toggleMute(); break;
        case "arrowleft": e.preventDefault(); if (videoRef.current) videoRef.current.currentTime -= 10; break;
        case "arrowright": e.preventDefault(); if (videoRef.current) videoRef.current.currentTime += 10; break;
        case "arrowup": e.preventDefault(); if (videoRef.current) { videoRef.current.volume = Math.min(1, videoRef.current.volume + 0.1); setVolume(videoRef.current.volume); } break;
        case "arrowdown": e.preventDefault(); if (videoRef.current) { videoRef.current.volume = Math.max(0, videoRef.current.volume - 0.1); setVolume(videoRef.current.volume); } break;
        case "c": e.preventDefault(); setCcEnabled((p) => !p); break;
        case "p": e.preventDefault(); togglePiP(); break;
        case "n": if (mediaType === "tv") { e.preventDefault(); handleNextEpisode(); } break;
        case "?": e.preventDefault(); setShowShortcuts((s) => !s); break;
        case "escape":
          if (showShortcuts) setShowShortcuts(false);
          else if (showSettings) setShowSettings(false);
          else handleClose();
          break;
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [playerModal, togglePlay, toggleFullscreen, toggleMute, togglePiP, showSettings, showShortcuts, handleClose, mediaType, handleNextEpisode, handlePrevEpisode]);

  const handleServerSelect = useCallback(async (value: string) => {
    if (!value) return;
    if (value === "custom_magnet") {
      setShowMagnetModal(true);
      return;
    }
    if (value.startsWith("torrent_")) {
      const tIdx = parseInt(value.replace("torrent_", ""), 10);
      setSelectedTorrentIdx(tIdx);
      const selected = torrentStreams[tIdx];
      if (selected?.magnet) {
        mountWebtor(selected.magnet);
        showToast(`🧲 Switched to ${selected.title || selected.quality || "Personal Watch"}`, "info");
      }
      return;
    }
    if (value.startsWith("embed_")) {
      const eIdx = parseInt(value.replace("embed_", ""), 10);
      setEmbedServerIdx(eIdx);
      setStreamMode("cloud");
      try {
        localStorage.setItem("cinecub_stream_mode", "cloud");
        useStore.getState().setStreamMode("cloud");
      } catch {}
      setLoading(false);
      showToast(`☁️ Switched to ${CFG.SERVERS[eIdx]?.name || `Cloud Server ${eIdx + 1}`}`, "info");
    } else {
      const gIdx = serverGroups.findIndex((g) => g.id === value);
      if (gIdx !== -1) {
        setActiveGroupIdx(gIdx);
        activeGroupIdxRef.current = gIdx;
        setStreamMode("direct");
        try {
          localStorage.setItem("cinecub_stream_mode", "direct");
          useStore.getState().setStreamMode("direct");
        } catch {}
        const video = videoRef.current;
        const grp = serverGroups[gIdx];
        if (video && directStreams.length && grp) {
          const s = directStreams[grp.defaultStreamIdx];
          if (s?.url) {
            cleanupHls();
            setLoading(true);
            setIsBuffering(false);
            setError(false);
            const streamType = detectStreamType(s);
            const curTime = video.currentTime || 0;
            if (streamType === "m3u8") {
              const Hls = await loadHls();
              if (Hls.isSupported()) {
                const hls = new Hls(HLS_CONFIG);
                hlsRef.current = hls;
                hls.loadSource(s.url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                  if (curTime > 0) video.currentTime = curTime;
                  video.play().catch(() => {});
                  setLoading(false);
                  setIsBuffering(false);
                });
                hls.on(Hls.Events.ERROR, (_: unknown, d: { fatal?: boolean }) => {
                  if (d.fatal) handleDirectStreamError();
                });
              } else {
                video.src = s.url;
                video.load();
                if (curTime > 0) video.currentTime = curTime;
                video.play().catch(() => {});
                setLoading(false);
                setIsBuffering(false);
              }
            } else {
              video.src = s.url;
              video.load();
              if (curTime > 0) video.currentTime = curTime;
              video.play().catch(() => {});
              setLoading(false);
              setIsBuffering(false);
            }
          }
        }
        showToast(`⚡ Switched to ${serverGroups[gIdx].name}`, "info");
      }
    }
  }, [serverGroups, directStreams, cleanupHls, handleDirectStreamError, torrentStreams, mountWebtor]);

  const filteredTorrents = useMemo(() => {
    const q = torrentSearchQuery.toLowerCase().trim();
    return torrentStreams.filter((t) => {
      if (qualityFilter === "4k" && !/4k|2160p/i.test(t.quality || t.title)) return false;
      if (qualityFilter === "1080p" && !/1080p/i.test(t.quality || t.title)) return false;
      if (qualityFilter === "720p" && !/720p/i.test(t.quality || t.title)) return false;
      if (q) {
        const matchTitle = (t.title || "").toLowerCase().includes(q);
        const matchProvider = (t.provider || "").toLowerCase().includes(q);
        const matchQuality = (t.quality || "").toLowerCase().includes(q);
        if (!matchTitle && !matchProvider && !matchQuality) return false;
      }
      return true;
    });
  }, [torrentStreams, qualityFilter, torrentSearchQuery]);

  if (!playerModal) return null;

  const isDirect = streamMode === "direct";
  const isTorrent = streamMode === "torrent";


  const directOptions = loading
    ? [{ value: "", label: "⚡ Finding direct streams..." }]
    : serverGroups.length > 0
    ? serverGroups.map((g) => ({ value: g.id, label: `⚡ ${g.name}` }))
    : [{ value: "", label: "⚡ Direct Server Offline (Render suspended)" }];

  const cloudOptions = CFG.SERVERS.map((srv, idx) => ({
    value: `embed_${idx}`,
    label: `☁️ ${srv.name}`,
  }));

  const torrentOptions = loadingTorrents
    ? [{ value: "", label: "🧲 Scraping Personal Watch streams..." }]
    : [
        ...torrentStreams.map((t, idx) => ({
          value: `torrent_${idx}`,
          label: `[${t.quality || "HD"}] ${t.provider || "Torrent"}${t.seeds > 0 ? ` • ${t.seeds}s` : ""}${t.size ? ` (${t.size})` : ""}`,
        })),
        ...(customMagnet ? [{ value: "custom_magnet_active", label: "🧲 Custom Magnet Link" }] : []),
        { value: "custom_magnet", label: "➕ Enter Custom Magnet / URL..." },
      ];

  const serverOptions = isTorrent ? torrentOptions : isDirect ? directOptions : cloudOptions;
  const activeServerValue = isTorrent
    ? (customMagnet ? "custom_magnet_active" : `torrent_${selectedTorrentIdx}`)
    : isDirect
    ? (serverGroups[activeGroupIdx]?.id || (serverGroups[0]?.id || ""))
    : `embed_${embedServerIdx}`;

  const hasError = Boolean(
    error ||
    (isDirect && !loading && directStreams.length === 0)
  );

  return (
    <div className="player-modal-overlay open" id="player-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="player-modal-container" id="player-modal">
        <div className="player-modal-header">
          <div className="player-modal-title-wrap">
            <div className="player-modal-title" id="player-modal-title">{mediaTitle}</div>
            <span className="player-modal-subtitle" id="player-modal-subtitle" style={{ display: mediaType === "tv" ? "inline" : "none" }}>
              {mediaSeason === 0 ? "Specials" : `Season ${mediaSeason}`} · Ep {mediaEpisode}
            </span>
          </div>
          <div className="player-modal-header-actions" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="player-header-action-btn"
              onClick={handleShare}
              title="Share Stream Link"
              aria-label="Share Stream Link"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#e2e8f0",
                borderRadius: "8px",
                width: "36px",
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: "14px",
                transition: "all 0.2s ease",
              }}
            >
              <i className="fas fa-share-alt" />
            </button>
            <button
              type="button"
              className="player-header-action-btn"
              onClick={() => setShowShortcuts((s) => !s)}
              title="Keyboard Shortcuts (?)"
              aria-label="Keyboard Shortcuts"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#e2e8f0",
                borderRadius: "8px",
                width: "36px",
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: "14px",
                transition: "all 0.2s ease",
              }}
            >
              <i className="fas fa-keyboard" />
            </button>
            <button type="button" className="player-modal-close" id="player-close-btn" onClick={handleClose} title="Close Player (Esc)" aria-label="Close Player"><i className="fas fa-times" /></button>
          </div>
        </div>
        <div className="player-modal-body">
          <div className="fv-theater-stage" id="fv-theater-stage">
            <div className="fv-tab-pane active" id="tab-watch">
              <div className="player-stage-split" id="player-stage-split">
                <div className="ep-nav player-sidebar-nav" id="ep-nav-controls">
                  {/* Stream Mode Selection */}
                  <div className="player-nav-section stream-mode-section">
                    <div className="player-nav-section-label">
                      <i className="fas fa-sliders-h" /> <span>Source Mode</span>
                    </div>
                    <div className="stream-mode-toggle" id="stream-mode-toggle" role="radiogroup" aria-label="Stream Mode">
                      <button type="button" id="mode-btn-cloud" className={`stream-mode-btn mode-cloud${streamMode === "cloud" ? " active" : ""}`} onClick={() => handleSetStreamMode("cloud")} title="Cloud Stream (Third-party embed servers)"><i className="fas fa-cloud" /> <span>Cloud Stream</span></button>
                      <button type="button" id="mode-btn-direct" className={`stream-mode-btn mode-direct${streamMode === "direct" ? " active" : ""}`} onClick={() => handleSetStreamMode("direct")} title="Direct Stream (Native ad-free player)"><i className="fas fa-bolt" /> <span>Direct Stream</span></button>
                      <button type="button" id="mode-btn-torrent" className={`stream-mode-btn mode-torrent${streamMode === "torrent" ? " active" : ""}`} onClick={() => handleSetStreamMode("torrent")} title="Personal Watch (P2P Stream & Torrent links)"><i className="fas fa-magnet" /> <span>Personal Watch</span></button>
                    </div>
                    {streamMode === "torrent" && (
                      <div className="pw-sidebar-action-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", width: "100%", marginTop: "6px" }}>
                        <button
                          type="button"
                          className={`btn-custom-magnet${showTorrentHub ? " is-hub-open" : ""}`}
                          style={{ width: "100%", justifyContent: "center", marginTop: 0 }}
                          onClick={() => setShowTorrentHub((prev) => !prev)}
                          title={showTorrentHub ? "Back to Player" : "Browse all torrent streams and qualities"}
                        >
                          <i className={showTorrentHub ? "fas fa-play" : "fas fa-layer-group"} />
                          <span>{showTorrentHub ? "Back to Player" : `Streams (${torrentStreams.length})`}</span>
                        </button>
                        <button
                          type="button"
                          className="btn-custom-magnet"
                          style={{ width: "100%", justifyContent: "center", marginTop: 0 }}
                          onClick={() => setShowMagnetModal(true)}
                          title="Paste custom magnet link or torrent URL"
                        >
                          <i className="fas fa-paste" /> <span>Custom Magnet</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Server / Release Selector */}
                  <div className="player-nav-section server-select-section">
                    <div className="player-nav-section-label">
                      <i className={streamMode === "torrent" ? "fas fa-download" : "fas fa-server"} />
                      <span>{streamMode === "torrent" ? "Personal Watch Release" : "Server"}</span>
                    </div>
                    <CustomSelect
                      id="player-server-select"
                      wrapId="player-server-select-wrap"
                      className="ep-server-wrap"
                      title="Select Server"
                      ariaLabel="Select Server"
                      options={serverOptions}
                      value={activeServerValue}
                      onChange={handleServerSelect}
                    />
                  </div>

                  {/* TV Season & Episode Navigation */}
                  {mediaType === "tv" && (
                    <div className="player-nav-section tv-episodes-section">
                      <div className="player-nav-section-label">
                        <i className="fas fa-list-ol" /> <span>Episodes</span>
                      </div>
                      <div className="tv-season-ep-row">
                        {seasonsList.length > 0 && (
                          <CustomSelect
                            id="ep-season"
                            wrapId="ep-season-wrap"
                            className="ep-season-wrap"
                            title="Select Season"
                            ariaLabel="Select Season"
                            options={seasonsList.map((s) => ({
                              value: String(s.season_number),
                              label: s.season_number === 0 ? "Specials" : `Season ${s.season_number}`,
                            }))}
                            value={String(curSeason)}
                            onChange={(val) => handleSeasonChange(Number(val))}
                          />
                        )}
                        <CustomSelect
                          id="ep-episode"
                          wrapId="ep-episode-wrap"
                          className="ep-episode-wrap"
                          title="Select Episode"
                          ariaLabel="Select Episode"
                          options={Array.from({ length: maxEpisodes }, (_, i) => i + 1).map((epNum) => ({
                            value: String(epNum),
                            label: `Episode ${epNum}`,
                          }))}
                          value={String(curEpisode)}
                          onChange={(val) => handleEpisodeChange(Number(val))}
                        />
                      </div>
                      <div className="ep-btns" id="ep-btns-wrap">
                        <button
                          type="button"
                          className="ep-nav-btn ep-nav-btn-prev"
                          id="ep-btn-prev"
                          onClick={handlePrevEpisode}
                          aria-label="Previous Episode"
                          title="Previous Episode"
                        >
                          <i className="fas fa-chevron-left" /> <span>Prev Ep</span>
                        </button>
                        <button
                          type="button"
                          className="ep-nav-btn ep-nav-btn-next"
                          id="ep-btn-next"
                          onClick={handleNextEpisode}
                          aria-label="Next Episode"
                          title="Next Episode"
                        >
                          <span>Next Ep</span> <i className="fas fa-chevron-right" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div id="server-tabs" style={{ display: "none" }} />

              <div
                className={`player-wrap${hasError ? " has-error" : ""}`}
                id="player-wrap-main"
                ref={containerRef}
                onTouchEnd={handleTouchEnd}
                onDoubleClick={toggleFullscreen}
                onWheel={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  const delta = e.deltaY < 0 ? 0.05 : -0.05;
                  v.volume = Math.max(0, Math.min(1, v.volume + delta));
                  setVolume(v.volume);
                }}
                style={{ position: "relative", background: "#0e0e17" }}
              >
                {streamMode === "torrent" ? (
                  <>
                    {!showTorrentHub ? (
                      <div className="pw-live-stage" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 2, background: "#000", borderRadius: "inherit", overflow: "hidden" }}>
                        {activeTorrentMagnet && (activeTorrentMagnet.startsWith("http://") || activeTorrentMagnet.startsWith("https://")) ? (
                          <video
                            ref={videoRef}
                            id="native-player-watch"
                            src={activeTorrentMagnet}
                            autoPlay
                            playsInline
                            controls
                            controlsList="nodownload noremoteplayback"
                            onContextMenu={(e) => e.preventDefault()}
                            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "#000", zIndex: 2, borderRadius: "inherit" }}
                            onTimeUpdate={handleTimeUpdate}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onWaiting={() => setIsBuffering(true)}
                            onPlaying={() => { setIsBuffering(false); setIsPlaying(true); setLoading(false); }}
                            onCanPlay={() => { setIsBuffering(false); setLoading(false); }}
                            onLoadedData={() => setLoading(false)}
                            onEnded={() => {
                              if (mediaType === "tv") {
                                handleNextEpisode();
                              }
                            }}
                          />
                        ) : (
                          <iframe
                            ref={iframeRef}
                            id="main-player"
                            className="player-iframe"
                            src={getEmbedUrl(embedServerIdx)}
                            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
                            allowFullScreen
                            scrolling="no"
                            title="CineCub Video Player"
                            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none", zIndex: 2, borderRadius: "inherit" }}
                            onLoad={() => setLoading(false)}
                            onError={() => { setError(true); setLoading(false); }}
                          />
                        )}

                        {/* Top Stream Status Actions */}
                        <div className="pw-active-stream-overlay">
                          <div className="pw-overlay-actions">
                            <button
                              type="button"
                              className="pw-overlay-btn btn-hub"
                              onClick={() => setShowTorrentHub(true)}
                              title="Browse all torrent streams and qualities"
                            >
                              <i className="fas fa-layer-group" />
                              <span>Streams ({torrentStreams.length})</span>
                            </button>

                            {activeTorrentMagnet && (
                              <button
                                type="button"
                                className="pw-overlay-btn"
                                onClick={() => copyMagnet(activeTorrentMagnet)}
                                title="Copy Magnet link to clipboard"
                              >
                                <i className="fas fa-copy" />
                                <span className="pw-btn-text-desktop">Copy Magnet</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="personal-watch-hub">
                        <div className="pw-hub-header">
                          <div className="pw-hub-header-left">
                            <div className="pw-hub-top-row">
                              <div className="pw-hub-badge">
                                <i className="fas fa-shield-alt" /> <span>Free &amp; Private P2P</span>
                              </div>
                              <button
                                type="button"
                                className="pw-hub-close-btn pw-hub-close-btn-mobile"
                                onClick={() => setShowTorrentHub(false)}
                                title="Back to Video Player"
                              >
                                <i className="fas fa-arrow-left" /> <span>Back to Player</span>
                              </button>
                            </div>
                            <h2 className="pw-hub-title">
                              <i className="fas fa-magnet" style={{ color: "#34d399" }} /> Personal Watch
                            </h2>
                            <p className="pw-hub-subtitle">
                              Stream any Magnet link, .torrent file, or auto-discovered indexer stream directly in 4K/HD across 30+ providers.
                            </p>
                          </div>
                          <button
                            type="button"
                            className="pw-hub-close-btn pw-hub-close-btn-desktop"
                            onClick={() => setShowTorrentHub(false)}
                            title="Back to Video Player"
                          >
                            <i className="fas fa-arrow-left" /> <span>Back to Player</span>
                          </button>
                        </div>

                        {/* 2-Column Split: Left (Auto-Found Streams + Active Addons), Right (Upload Torrent + Custom Magnet + Custom Addons) */}
                        <div className="pw-hub-grid">
                          {/* LEFT PART: Auto-Found Streams & Active Addons */}
                          <div className="pw-hub-col-left">
                            <div className="pw-section-card">
                              <div className="pw-section-toolbar">
                                <div className="pw-section-title">
                                  <i className="fas fa-bolt" />
                                  <span>
                                    Auto-Found Streams{" "}
                                    {torrentStreams.length > 0 && `(${filteredTorrents.length})`}
                                  </span>
                                </div>
                                <div className="pw-toolbar-actions">
                                  <div className="pw-filter-pills">
                                    {(["all", "4k", "1080p", "720p"] as const).map((q) => (
                                      <button
                                        key={q}
                                        type="button"
                                        className={`pw-filter-pill${qualityFilter === q ? " active" : ""}`}
                                        onClick={() => setQualityFilter(q)}
                                      >
                                        {q.toUpperCase()}
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    className="pw-btn-refresh"
                                    onClick={refreshTorrents}
                                    title="Refresh Streams"
                                  >
                                    <i className={`fas fa-sync-alt${loadingTorrents ? " fa-spin" : ""}`} />
                                  </button>
                                </div>
                              </div>

                              <div className="pw-search-wrap">
                                <i className="fas fa-search" />
                                <input
                                  type="text"
                                  className="pw-search-input"
                                  placeholder="Search streams (e.g. 4k, 1080p, x265, hdr, yts, bluray, tpb)..."
                                  value={torrentSearchQuery}
                                  onChange={(e) => setTorrentSearchQuery(e.target.value)}
                                />
                              </div>

                              <div className="pw-stream-list">
                                {loadingTorrents ? (
                                  <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text-3)" }}>
                                    <i className="fas fa-circle-notch fa-spin" style={{ fontSize: "1.8rem", color: "#34d399", marginBottom: "10px" }} />
                                    <div style={{ fontSize: "13px", fontWeight: 500, color: "#f1f5f9" }}>
                                      Scraping 30+ providers (1337x, YTS, TPB, Bitsearch, TGx, Nyaa, RARBG, EZTV, RuTracker)...
                                    </div>
                                  </div>
                                ) : filteredTorrents.length === 0 ? (
                                  <div style={{ padding: "26px 20px", textAlign: "center", color: "var(--text-3)", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px" }}>
                                    <i className="fas fa-search" style={{ fontSize: "1.6rem", color: "#94a3b8", marginBottom: "8px" }} />
                                    <div style={{ fontSize: "13px", fontWeight: 500, color: "#fff", marginBottom: "4px" }}>
                                      {torrentStreams.length === 0
                                        ? "No auto-discovered streams found for this release."
                                        : "No streams match the selected quality or search filter."}
                                    </div>
                                    <div style={{ fontSize: "11.5px" }}>
                                      Try selecting [ALL], upload a .torrent, or add custom addons on the right.
                                    </div>
                                  </div>
                                ) : (
                                  filteredTorrents.map((t, idx) => {
                                    const isCurActive = activeTorrentMagnet === t.magnet;
                                    const qLower = (t.quality || "hd").toLowerCase();
                                    const qClass = qLower.includes("4k") || qLower.includes("2160")
                                      ? "q-4k"
                                      : qLower.includes("1080")
                                      ? "q-1080p"
                                      : qLower.includes("720")
                                      ? "q-720p"
                                      : "q-hd";
                                    return (
                                      <div
                                        key={t.id || `t_${idx}`}
                                        className={`pw-stream-card${isCurActive ? " is-active" : ""}`}
                                      >
                                        <div className="pw-card-left">
                                          <span className={`pw-quality-badge ${qClass}`}>
                                            {t.quality || "HD"}
                                          </span>
                                          <div className="pw-card-info">
                                            <div className="pw-card-title" title={t.title}>
                                              {t.title}
                                            </div>
                                            <div className="pw-card-meta">
                                              {t.provider && (
                                                <span className={`pw-provider-badge ${getProviderBadgeClass(t.provider)}`}>
                                                  <i className="fas fa-server" /> {t.provider}
                                                </span>
                                              )}
                                              {t.size && (
                                                <span className="meta-item">
                                                  <i className="fas fa-hdd" /> {t.size}
                                                </span>
                                              )}
                                              {t.seeds > 0 && (
                                                <span className="meta-item meta-seeds">
                                                  <i className="fas fa-user-friends" /> {t.seeds} seeds
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="pw-card-actions">
                                          <button
                                            type="button"
                                            className="pw-card-play-btn"
                                            onClick={() => {
                                              const fullIdx = torrentStreams.findIndex((item) => item.magnet === t.magnet);
                                              if (fullIdx !== -1) setSelectedTorrentIdx(fullIdx);
                                              mountWebtor(t.magnet);
                                            }}
                                            title="Play stream directly"
                                          >
                                            <i className="fas fa-play" /> <span>{isCurActive ? "Playing" : "Play"}</span>
                                          </button>
                                          <button
                                            type="button"
                                            className="pw-card-copy-btn"
                                            onClick={() => copyMagnet(t.magnet)}
                                            title="Copy Magnet link"
                                          >
                                            <i className="fas fa-copy" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            {/* Active Scraper Addons & Indexers List ("also on left show addon list available") */}
                            <div className="pw-section-card pw-addons-card">
                              <div className="pw-addons-header">
                                <div className="pw-addons-title">
                                  <i className="fas fa-plug" style={{ color: "#34d399" }} />
                                  <span>Active Scraper Addons &amp; Indexers</span>
                                </div>
                                <span className="pw-addons-count-badge">
                                  {BUILTIN_ADDONS.length + customAddons.length} Online
                                </span>
                              </div>
                              <p className="pw-addons-sub">
                                Auto-queried across global DHT networks, torrent indexers, and community Stremio addons.
                              </p>

                              <div className="pw-addons-grid">
                                {BUILTIN_ADDONS.map((addon) => (
                                  <div key={addon.id} className="pw-addon-item">
                                    <div className="pw-addon-indicator">
                                      <span className="pw-addon-dot" />
                                    </div>
                                    <div className="pw-addon-details">
                                      <div className="pw-addon-name-row">
                                        <span className="pw-addon-name">{addon.name}</span>
                                        <span className="pw-addon-type-badge">{addon.type}</span>
                                      </div>
                                      <span className="pw-addon-desc">{addon.desc}</span>
                                    </div>
                                  </div>
                                ))}

                                {customAddons.map((addonUrl, idx) => {
                                  let host = addonUrl;
                                  try { host = new URL(addonUrl).hostname; } catch {}
                                  return (
                                    <div key={`custom_${idx}`} className="pw-addon-item is-custom">
                                      <div className="pw-addon-indicator">
                                        <span className="pw-addon-dot dot-purple" />
                                      </div>
                                      <div className="pw-addon-details">
                                        <div className="pw-addon-name-row">
                                          <span className="pw-addon-name">{host}</span>
                                          <span className="pw-addon-type-badge badge-custom">Custom Addon</span>
                                        </div>
                                        <span className="pw-addon-desc" title={addonUrl}>{addonUrl}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* RIGHT PART: Upload Torrent, Custom Addons & Custom Magnet */}
                          <div className="pw-hub-col-right">
                            {/* 1. Upload .torrent file */}
                            <div className="pw-section-card">
                              <div className="pw-section-header-compact">
                                <i className="fas fa-cloud-upload-alt" style={{ color: "#34d399" }} />
                                <span>Upload .torrent File</span>
                              </div>
                              <p className="pw-compact-sub">
                                Drag &amp; drop any <code>.torrent</code> file to parse info-hash and stream instantly.
                              </p>
                              <div
                                className={`pw-dropzone${isDragOverDropzone ? " drag-over" : ""}`}
                                onDragOver={(e) => { e.preventDefault(); setIsDragOverDropzone(true); }}
                                onDragLeave={() => setIsDragOverDropzone(false)}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  setIsDragOverDropzone(false);
                                  const file = e.dataTransfer.files[0];
                                  if (file) handleTorrentFile(file);
                                }}
                                onClick={() => {
                                  const input = document.getElementById("pw-torrent-file-input") as HTMLInputElement;
                                  if (input) input.click();
                                }}
                              >
                                <input
                                  type="file"
                                  id="pw-torrent-file-input"
                                  accept=".torrent"
                                  style={{ display: "none" }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleTorrentFile(file);
                                  }}
                                />
                                <i className="fas fa-file-video pw-dropzone-icon" />
                                <div className="pw-dropzone-text">Drop a .torrent file here or browse files</div>
                                <div className="pw-dropzone-subtext">Streams instantly in-browser via Personal Watch P2P</div>
                              </div>
                            </div>

                            {/* 2. Paste Custom Magnet / URL */}
                            <div className="pw-section-card">
                              <div className="pw-section-header-compact">
                                <i className="fas fa-link" style={{ color: "#34d399" }} />
                                <span>Paste Custom Magnet / URL</span>
                              </div>
                              <div className="pw-custom-magnet-row">
                                <div className="pw-magnet-input-wrap">
                                  <i className="fas fa-magnet" />
                                  <input
                                    type="text"
                                    className="pw-magnet-input"
                                    placeholder="Paste Magnet link, torrent hash, or direct URL..."
                                    value={magnetInput}
                                    onChange={(e) => setMagnetInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const trimmed = magnetInput.trim();
                                        if (trimmed) {
                                          setCustomMagnet(trimmed);
                                          mountWebtor(trimmed);
                                        }
                                      }
                                    }}
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="pw-btn-play-custom"
                                  onClick={() => {
                                    const trimmed = magnetInput.trim();
                                    if (!trimmed) {
                                      showToast("Please enter a valid magnet link or URL", "error");
                                      return;
                                    }
                                    setCustomMagnet(trimmed);
                                    mountWebtor(trimmed);
                                  }}
                                >
                                  <i className="fas fa-bolt" /> <span>Play</span>
                                </button>
                              </div>
                            </div>

                            {/* 3. Add Custom Addons ("or addons") */}
                            <div className="pw-section-card">
                              <div className="pw-section-header-compact">
                                <i className="fas fa-puzzle-piece" style={{ color: "var(--cv-purple-light)" }} />
                                <span>Custom Stremio Addons</span>
                              </div>
                              <p className="pw-compact-sub">
                                Paste any Stremio-compatible addon manifest URL (e.g. <code>https://.../manifest.json</code>) to discover even more streams.
                              </p>

                              <div className="pw-custom-addon-input-row">
                                <div className="pw-magnet-input-wrap">
                                  <i className="fas fa-cube" />
                                  <input
                                    type="url"
                                    className="pw-magnet-input"
                                    placeholder="https://addon-domain/manifest.json"
                                    value={addonInput}
                                    onChange={(e) => setAddonInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleAddCustomAddon();
                                    }}
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="pw-btn-add-addon"
                                  onClick={handleAddCustomAddon}
                                >
                                  <i className="fas fa-plus" /> <span>Add</span>
                                </button>
                              </div>

                              {customAddons.length > 0 && (
                                <div className="pw-custom-addons-list">
                                  {customAddons.map((url, idx) => (
                                    <div key={`user_addon_${idx}`} className="pw-custom-addon-row">
                                      <span className="pw-custom-addon-url" title={url}>{url}</span>
                                      <button
                                        type="button"
                                        className="pw-btn-del-addon"
                                        onClick={() => handleRemoveCustomAddon(url)}
                                        title="Remove addon"
                                      >
                                        <i className="fas fa-trash-alt" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : isDirect ? (
                  <video
                    ref={videoRef}
                    id="native-player-watch"
                    playsInline
                    controlsList="nodownload noremoteplayback"
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "#000", zIndex: 2, borderRadius: "inherit" }}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onWaiting={() => setIsBuffering(true)}
                    onPlaying={() => { setIsBuffering(false); setIsPlaying(true); setLoading(false); }}
                    onCanPlay={() => { setIsBuffering(false); setLoading(false); }}
                    onLoadedData={() => setLoading(false)}
                    onEnded={() => {
                      if (mediaType === "tv") {
                        handleNextEpisode();
                      }
                    }}
                  />
                ) : (
                  <>
                    <iframe
                      ref={iframeRef}
                      id="main-player"
                      className="player-iframe"
                      src={getEmbedUrl(embedServerIdx)}
                      allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
                      allowFullScreen
                      scrolling="no"
                      title="CineCub Video Player"
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none", zIndex: 2, borderRadius: "inherit" }}
                      onLoad={() => setLoading(false)}
                      onError={() => { setError(true); setLoading(false); }}
                    />
                    <div
                      className="cloud-server-quick-bar"
                      style={{
                        position: "absolute",
                        top: "12px",
                        right: "12px",
                        zIndex: 25,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        pointerEvents: "auto",
                      }}
                    >
                      <button
                        type="button"
                        onClick={handleNextEmbedServer}
                        title="Buffering or slow? Click to switch cloud embed server"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 12px",
                          borderRadius: "20px",
                          background: "rgba(14, 14, 23, 0.78)",
                          backdropFilter: "blur(12px)",
                          WebkitBackdropFilter: "blur(12px)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#f1f5f9",
                          fontSize: "11.5px",
                          fontWeight: 500,
                          cursor: "pointer",
                          boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <i className="fas fa-server" style={{ color: "var(--cv-purple-light)", fontSize: "10px" }} />
                        <span>Server {embedServerIdx + 1} ({CFG.SERVERS[embedServerIdx]?.name?.split(" ")[1] || "Fast"})</span>
                        <i className="fas fa-chevron-right" style={{ fontSize: "9px", opacity: 0.7 }} />
                      </button>
                    </div>
                  </>
                )}

                {loading && !isTorrent && (
                  <div id="player-loading-placeholder" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0e0e17", borderRadius: "inherit", color: "var(--text-3)", textAlign: "center", padding: "20px", zIndex: 30 }}>
                    <i className="fas fa-circle-notch fa-spin" style={{ fontSize: "2.4rem", color: isTorrent ? "#10b981" : "var(--cv-purple)", marginBottom: "14px" }} />
                    <div style={{ fontSize: "14px", color: "var(--text-2)", fontWeight: 500 }} id="player-loading-text">
                      {isTorrent ? "Connecting to Personal Watch swarm..." : isDirect ? "Finding fastest stream..." : "Connecting to stream..."}
                    </div>
                  </div>
                )}

                {hasError && (
                  <div id="player-error-placeholder" className="player-empty-state">
                    {isTorrent ? (
                      <>
                        <div className="player-empty-icon" style={{ color: "#34d399" }}><i className="fas fa-magnet" /></div>
                        <div className="player-empty-title">No Personal Watch Streams Found</div>
                        <div className="player-empty-desc">
                          No public peer-to-peer streams were found for this title automatically. You can paste your own magnet link or switch to Cloud/Direct stream.
                        </div>
                        <div className="player-empty-actions">
                          <button type="button" className="player-action-btn btn-primary-torrent" onClick={() => setShowMagnetModal(true)}>
                            <i className="fas fa-paste" /> <span>Paste Magnet Link</span>
                          </button>
                          <button type="button" className="player-action-btn btn-primary-cloud" onClick={() => handleSetStreamMode("cloud")}>
                            <i className="fas fa-cloud" /> <span>Switch to Cloud</span>
                          </button>
                          <button type="button" className="player-action-btn btn-secondary-styled" onClick={() => handleSetStreamMode("direct")}>
                            <i className="fas fa-bolt" /> <span>Switch to Direct</span>
                          </button>
                        </div>
                      </>
                    ) : isDirect ? (
                      <>
                        <div className="player-empty-icon" style={{ color: "#e0aaff" }}><i className="fas fa-bolt" /></div>
                        <div className="player-empty-title">Direct Stream Unavailable</div>
                        <div className="player-empty-desc">
                          The ad-free Go streaming backend could not provide a playable direct stream for this title right now. You can retry, choose Cloud Stream embeds, or try Personal Watch.
                        </div>
                        <div className="player-empty-actions">
                          <button type="button" className="player-action-btn btn-secondary-styled" onClick={() => { setError(false); setLoading(true); setReloadSeq((s) => s + 1); }}>
                            <i className="fas fa-redo" /> <span>Retry Direct Stream</span>
                          </button>
                          <button type="button" className="player-action-btn btn-primary-cloud" onClick={() => handleSetStreamMode("cloud")}>
                            <i className="fas fa-cloud" /> <span>Switch to Cloud Stream</span>
                          </button>
                          <button type="button" className="player-action-btn btn-primary-torrent" onClick={() => handleSetStreamMode("torrent")}>
                            <i className="fas fa-magnet" /> <span>Switch to Personal Watch</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="player-empty-icon" style={{ color: "#e0aaff" }}><i className="fas fa-cloud-rain" /></div>
                        <div className="player-empty-title">Cloud Stream Unavailable</div>
                        <div className="player-empty-desc">
                          The current cloud stream server is not responding. Would you like to try the next cloud server, switch to Direct Stream, or check Personal Watch?
                        </div>
                        <div className="player-empty-actions">
                          <button type="button" className="player-action-btn btn-primary-cloud" onClick={() => { setError(false); setLoading(true); setEmbedServerIdx((i) => (i + 1) % CFG.SERVERS.length); }}>
                            <i className="fas fa-forward" /> <span>Next Cloud Server</span>
                          </button>
                          <button type="button" className="player-action-btn btn-secondary-styled" onClick={() => handleSetStreamMode("direct")}>
                            <i className="fas fa-bolt" /> <span>Switch to Direct Stream</span>
                          </button>
                          <button type="button" className="player-action-btn btn-primary-torrent" onClick={() => handleSetStreamMode("torrent")}>
                            <i className="fas fa-magnet" /> <span>Switch to Personal Watch</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="player-gesture-overlay" id="watch-gesture-overlay" style={{ display: "none", zIndex: 2 }} />

                {showUpNext && mediaType === "tv" && (
                  <div id="up-next-toast" className="up-next-toast">
                    <div className="up-next-text">Next Episode in <span id="up-next-time">{upNextCountdown}</span></div>
                    <button className="up-next-btn" onClick={() => { handleNextEpisode(); setShowUpNext(false); }}><i className="fas fa-play" /> Play Now</button>
                  </div>
                )}

                <div id="adfree-ctrl-bar" style={{ display: "none" }} />

                {/* Custom UI Shell — only visible in direct mode when not loading and streams exist */}
                <div className="player-custom-ui" id="player-custom-ui" style={{ display: isDirect && !loading && directStreams.length > 0 ? "flex" : "none" }}>
                  <div className="player-top-vignette" />
                  <div className="player-center-hud" id="player-center-hud">
                    <button type="button" className="player-hud-btn player-hud-seek-btn" id="player-center-rewind" title="Rewind 10 seconds" style={{ opacity: isBuffering ? 0.2 : 1, pointerEvents: isBuffering ? "none" : "auto" }} onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }}><svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12.5 3a9 9 0 1 0 8.7 6.7 1 1 0 0 0-1.9-.6A7 7 0 1 1 12.5 5h1.6l-1.3-1.3a1 1 0 0 0-1.4 1.4l3 3a1 1 0 0 0 1.4 0l3-3a1 1 0 0 0-1.4-1.4L16.1 5H12.5V3z"/></svg><span className="player-hud-seek-text">10</span></button>
                    <button type="button" className="player-hud-btn player-center-play-btn" id="player-center-play" title="Play / Pause" style={{ opacity: isBuffering ? 0.2 : 1, pointerEvents: isBuffering ? "none" : "auto" }} onClick={togglePlay}>
                      <svg className="icon-play" viewBox="0 0 24 24" width="46" height="46" fill="currentColor" style={{ display: isPlaying ? "none" : "block" }}><path d="M8 5.14v14l11-7-11-7z"/></svg>
                      <svg className="icon-pause" viewBox="0 0 24 24" width="46" height="46" fill="currentColor" style={{ display: isPlaying ? "block" : "none" }}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    </button>
                    <button type="button" className="player-hud-btn player-hud-seek-btn" id="player-center-forward" title="Forward 10 seconds" style={{ opacity: isBuffering ? 0.2 : 1, pointerEvents: isBuffering ? "none" : "auto" }} onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10; }}><svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M11.5 3a9 9 0 1 1-8.7 6.7 1 1 0 1 1 1.9-.6A7 7 0 1 0 11.5 5H9.9l1.3-1.3a1 1 0 0 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 1.4-1.4l1.3 1.3h3.6V3z"/></svg><span className="player-hud-seek-text">10</span></button>
                    <div className="player-hud-spinner" id="player-center-spinner" style={{ display: isBuffering ? "flex" : "none" }}><i className="fas fa-circle-notch fa-spin" /></div>
                  </div>

                  {/* Settings Popover */}
                  <div className={`player-settings-popover${showSettings ? " open" : ""}`} id="player-settings-popover">
                    <div className={`player-settings-panel main${settingsPanel === "main" ? " active-panel" : ""}`} id="player-settings-main">
                      <div className="player-settings-item" id="player-settings-speed-trigger" role="button" tabIndex={0} onClick={() => setSettingsPanel("speed")}><div className="player-settings-label"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4C7.03 4 3 8.03 3 13c0 2.21.8 4.23 2.12 5.8l1.43-1.43A7.006 7.006 0 0 1 5 13c0-3.87 3.13-7 7-7s7 3.13 7 7c0 1.63-.56 3.13-1.55 4.37l1.43 1.43A8.966 8.966 0 0 0 21 13c0-4.97-4.03-9-9-9zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V9H11z"/></svg><span>Playback Speed</span></div><div className="player-settings-right"><span className="val">{playbackSpeed === 1 ? "1x" : `${playbackSpeed}x`}</span><svg className="settings-chevron" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg></div></div>
                      <div className="player-settings-item" role="button" tabIndex={0}><div className="player-settings-label"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V6h14v12zM8 13h1.5v-1.5H11V10H9.5V8.5H8V13zm7-4.5h-3.5v6H13v-2h2c.55 0 1-.45 1-1v-2c0-.55-.45-1-1-1zm-.5 3H13v-1.5h1.5v1.5z"/></svg><span>Quality</span></div><div className="player-settings-right"><span className="val">Auto</span><svg className="settings-chevron" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg></div></div>
                      <div className="player-settings-item" role="button" tabIndex={0} onClick={() => setSettingsPanel("audio")}><div className="player-settings-label"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 3v9.28a4.39 4.39 0 0 0-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg><span>Audio Track</span></div><div className="player-settings-right"><span className="val">Default</span><svg className="settings-chevron" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg></div></div>
                      <div className="player-settings-item" role="button" tabIndex={0} onClick={() => setSettingsPanel("subsync")}><div className="player-settings-label"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg><span>Subtitle Sync</span></div><div className="player-settings-right"><span className="val">{subtitleOffset.toFixed(1)}s</span><svg className="settings-chevron" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg></div></div>
                      <div className="player-settings-item" role="button" tabIndex={0} onClick={() => setSettingsPanel("aspect")}><div className="player-settings-label"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V6h14v12z"/></svg><span>Aspect Ratio</span></div><div className="player-settings-right"><span className="val">{aspects.find((a) => a.value === aspectRatio)?.label || "Auto"}</span><svg className="settings-chevron" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg></div></div>
                    </div>
                    {/* Speed Submenu */}
                    <div className={`player-settings-panel sub${settingsPanel === "speed" ? "" : " is-hidden"}`} style={{ display: settingsPanel === "speed" ? "flex" : "none" }}>
                      <div className="player-settings-back" role="button" tabIndex={0} onClick={() => setSettingsPanel("main")}><span className="back-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></span><span>Playback Speed</span></div>
                      {speeds.map((s) => (<div key={s} className={`player-settings-opt${playbackSpeed === s ? " active" : ""}`} onClick={() => { setPlaybackSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s; }}>{s === 1 ? "1x (Normal)" : `${s}x`}</div>))}
                    </div>
                    {/* Audio Submenu */}
                    <div className={`player-settings-panel sub${settingsPanel === "audio" ? "" : " is-hidden"}`} style={{ display: settingsPanel === "audio" ? "flex" : "none" }}>
                      <div className="player-settings-back" role="button" tabIndex={0} onClick={() => setSettingsPanel("main")}><span className="back-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></span><span>Audio Tracks</span></div>
                      <div className="player-settings-opt active">Track 1: Default (Stereo / 5.1)</div>
                    </div>
                    {/* Subtitle Sync Submenu */}
                    <div className={`player-settings-panel sub${settingsPanel === "subsync" ? "" : " is-hidden"}`} style={{ display: settingsPanel === "subsync" ? "flex" : "none" }}>
                      <div className="player-settings-back" role="button" tabIndex={0} onClick={() => setSettingsPanel("main")}><span className="back-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></span><span>Subtitle Sync &amp; Delay</span></div>
                      <div style={{ padding: "10px 6px", display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>Current Offset:</span><span style={{ fontSize: "13px", fontWeight: 700, color: "#b55fe6", background: "rgba(181,95,230,0.15)", padding: "2px 8px", borderRadius: "6px" }}>{subtitleOffset.toFixed(2)}s</span></div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                          <button type="button" className="subsync-btn" onClick={() => setSubtitleOffset((p) => p - 1.0)}>-1.0s</button>
                          <button type="button" className="subsync-btn" onClick={() => setSubtitleOffset((p) => p - 0.25)}>-250ms</button>
                          <button type="button" className="subsync-btn subsync-btn-reset" onClick={() => setSubtitleOffset(0)}>Reset</button>
                          <button type="button" className="subsync-btn" onClick={() => setSubtitleOffset((p) => p + 0.25)}>+250ms</button>
                          <button type="button" className="subsync-btn" onClick={() => setSubtitleOffset((p) => p + 1.0)}>+1.0s</button>
                          <button type="button" className="subsync-btn" onClick={() => setSubtitleOffset((p) => p + 2.5)}>+2.5s</button>
                        </div>
                        <div style={{ marginTop: "4px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                          <label className="subsync-upload-label" htmlFor="custom-sub-file-input"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" /></svg><span>Load Subtitle (.srt / .vtt)</span></label>
                          <input type="file" id="custom-sub-file-input" accept=".srt,.vtt" style={{ display: "none" }} />
                        </div>
                      </div>
                    </div>
                    {/* Aspect Ratio Submenu */}
                    <div className={`player-settings-panel sub${settingsPanel === "aspect" ? "" : " is-hidden"}`} style={{ display: settingsPanel === "aspect" ? "flex" : "none" }}>
                      <div className="player-settings-back" role="button" tabIndex={0} onClick={() => setSettingsPanel("main")}><span className="back-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></span><span>Aspect Ratio</span></div>
                      {aspects.map((a) => (<div key={a.value} className={`player-settings-opt${aspectRatio === a.value ? " active" : ""}`} onClick={() => setAspectRatio(a.value)}>{a.label}</div>))}
                    </div>
                  </div>

                  {/* Bottom Control Bar */}
                  <div className="player-bottom-bar" id="player-bottom-bar">
                    <div
                      className="player-timeline-wrap"
                      ref={progressRef}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    >
                      <div className="player-timeline-rail">
                        <div className="player-timeline-buffer" />
                        <div className="player-timeline-played" ref={timelinePlayedRef} style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}><div className="player-timeline-thumb" /></div>
                      </div>
                      <div className="player-timeline-tooltip" ref={timelineTooltipRef}>{formatTime(currentTime)}</div>
                    </div>
                    <div className="player-controls-row">
                      <div className="player-ctrls-left">
                        <button type="button" className="player-icon-btn" title="Play / Pause (Space)" onClick={togglePlay}>
                          <svg className="icon-play" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ display: isPlaying ? "none" : "block" }}><path d="M8 5v14l11-7z" /></svg>
                          <svg className="icon-pause" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ display: isPlaying ? "block" : "none" }}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                        </button>
                        <div className="player-volume-wrap">
                          <button type="button" className="player-icon-btn player-vol-btn" title="Mute (m)" onClick={toggleMute}>
                            <svg className="icon-vol-high" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ display: !isMuted && volume > 0.5 ? "block" : "none" }}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
                            <svg className="icon-vol-low" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ display: !isMuted && volume > 0 && volume <= 0.5 ? "block" : "none" }}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" /></svg>
                            <svg className="icon-vol-mute" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ display: isMuted || volume === 0 ? "block" : "none" }}><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
                          </button>
                          <div className="player-volume-slider-wrap"><input type="range" className="player-volume-slider" min="0" max="1" step="0.02" value={volume} onChange={handleVolumeChange} aria-label="Volume" /></div>
                        </div>
                        <div className="player-time-display"><span ref={timeCurrentRef}>{formatTime(currentTime)}</span><span className="player-time-sep">/</span><span ref={timeDurationRef}>{formatTime(duration)}</span></div>
                        <div className="player-ctrls-divider" />
                        <div className="player-media-title" title={mediaTitle}>{mediaTitle}</div>
                      </div>
                      <div className="player-ctrls-right">
                        <button type="button" className={`player-icon-btn player-cc-btn${ccEnabled ? " active" : ""}`} onClick={() => setCcEnabled(!ccEnabled)} title="Subtitles (c)"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V6h14v12zM7 15h3c.55 0 1-.45 1-1v-1H9.5v.5h-2v-3h2v.5H11v-1c0-.55-.45-1-1-1H7c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1zm7 0h3c.55 0 1-.45 1-1v-1h-1.5v.5h-2v-3h2v.5H18v-1c0-.55-.45-1-1-1h-3c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1z" /></svg><span className="cc-status-bar" /></button>
                        <button type="button" className="player-icon-btn" title="Settings" onClick={() => { setShowSettings(!showSettings); setSettingsPanel("main"); }}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg></button>
                        {mediaType === "tv" && (<button type="button" className="player-icon-btn" onClick={handleNextEpisode} title="Next Episode (n)"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg></button>)}
                        <button type="button" className="player-icon-btn" onClick={handleShare} title="Share Stream Link"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg></button>
                        <button type="button" className="player-icon-btn player-shortcuts-btn" onClick={() => setShowShortcuts((s) => !s)} title="Shortcuts (?)"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/></svg></button>
                        <button type="button" className="player-icon-btn player-pip-btn" id="player-btn-pip" onClick={togglePiP} title="Picture-in-Picture (p)"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.98 2 1.98h18c1.1 0 2-.88 2-1.98V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z" /></svg></button>
                        <button type="button" className="player-icon-btn" title="Fullscreen (f)" onClick={toggleFullscreen}>
                          <svg className="icon-fullscreen" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ display: isFullscreen ? "none" : "block" }}><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
                          <svg className="icon-exit-fullscreen" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ display: isFullscreen ? "block" : "none" }}><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Custom Magnet Link Modal */}
      {showMagnetModal && (
        <div
          className="player-modal-overlay open"
          style={{ zIndex: 10000, background: "rgba(0, 0, 0, 0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMagnetModal(false);
          }}
        >
          <div
            className="player-modal-container"
            style={{ maxWidth: "540px", width: "90%", padding: "24px", background: "#12121a", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: "16px", boxShadow: "0 20px 40px rgba(0,0,0,0.8)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "9px" }}>
                <i className="fas fa-magnet" style={{ color: "#10b981" }} /> Custom Magnet / Torrent Link
              </div>
              <button
                type="button"
                onClick={() => setShowMagnetModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: "1.2rem", padding: "4px 8px" }}
                aria-label="Close"
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <p style={{ color: "var(--text-3)", fontSize: "13px", lineHeight: 1.5, marginBottom: "14px" }}>
              Paste any valid magnet URI (<code>magnet:?xt=urn:btih:...</code>) or HTTP/HTTPS torrent URL to stream directly in your browser via Personal Watch.
            </p>
            <textarea
              value={magnetInput}
              onChange={(e) => setMagnetInput(e.target.value)}
              placeholder="magnet:?xt=urn:btih:..."
              rows={4}
              style={{
                width: "100%",
                background: "#0a0a0f",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "10px",
                color: "#fff",
                padding: "12px",
                fontSize: "13px",
                fontFamily: "monospace",
                resize: "none",
                marginBottom: "18px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowMagnetModal(false)}
                style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", color: "#fff", padding: "8px 16px", borderRadius: "10px", cursor: "pointer", fontSize: "13px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const trimmed = magnetInput.trim();
                  if (!trimmed) {
                    showToast("Please enter a valid magnet link or torrent URL", "error");
                    return;
                  }
                  setCustomMagnet(trimmed);
                  setShowMagnetModal(false);
                  setStreamMode("torrent");
                  try {
                    localStorage.setItem("cinecub_stream_mode", "torrent");
                    useStore.getState().setStreamMode("torrent");
                  } catch {}
                  mountWebtor(trimmed);
                  showToast("🧲 Loading custom magnet via Personal Watch...", "info");
                }}
                style={{ background: "linear-gradient(135deg, #059669 0%, #10b981 100%)", border: "1px solid rgba(16, 185, 129, 0.45)", color: "#fff", padding: "8px 20px", borderRadius: "10px", fontWeight: 600, cursor: "pointer", fontSize: "13px" }}
              >
                Stream Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      {showShortcuts && (
        <div
          className="player-modal-overlay open"
          onClick={() => setShowShortcuts(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            className="player-shortcuts-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(145deg, #181424, #0f0c18)",
              border: "1px solid rgba(181, 95, 230, 0.3)",
              borderRadius: "16px",
              padding: "24px 28px",
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(181,95,230,0.2)",
              color: "#fff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "17px", fontWeight: 700 }}>
                <i className="fas fa-keyboard" style={{ color: "#c77dff" }} />
                <span>Keyboard Shortcuts</span>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "16px" }}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8" }}>Play / Pause</span>
                <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", color: "#e2e8f0" }}>Space / K</kbd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8" }}>Fullscreen</span>
                <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", color: "#e2e8f0" }}>F</kbd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8" }}>Seek ±10s</span>
                <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", color: "#e2e8f0" }}>← / →</kbd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8" }}>Volume ±10%</span>
                <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", color: "#e2e8f0" }}>↑ / ↓</kbd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8" }}>Mute / Unmute</span>
                <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", color: "#e2e8f0" }}>M</kbd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8" }}>Subtitles</span>
                <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", color: "#e2e8f0" }}>C</kbd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8" }}>Picture-in-Picture</span>
                <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", color: "#e2e8f0" }}>P</kbd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8" }}>Next Episode</span>
                <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", color: "#e2e8f0" }}>N</kbd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8" }}>Prev Episode</span>
                <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", color: "#e2e8f0" }}>Shift + P</kbd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8" }}>Help Overlay</span>
                <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", color: "#e2e8f0" }}>?</kbd>
              </div>
            </div>
            <div style={{ marginTop: "18px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
              Press <kbd style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: "4px" }}>Esc</kbd> anytime to dismiss
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
