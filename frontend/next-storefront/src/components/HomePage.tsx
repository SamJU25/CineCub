"use client";

import { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from "react";
import { useStore } from "@/lib/store";
import { getTrending, getPopular, getTopRated, getUpcoming, getAnime, tmdbFetch, IMG, getTrailerSource, type TrailerSource, getDetail } from "@/lib/api";
import type { MediaItem, HistoryItem } from "@/lib/types";
import { CFG } from "@/lib/config";
import { PosterCard, Top10Card, LandscapeCard, ContinueWatchingCard, CinematicTrailerCard } from "@/components/Cards";
import HScrollWrapper from "@/components/HScrollWrapper";
import { showToast } from "@/components/Toast";

interface CWItem {
  id: number;
  type: "movie" | "tv";
  title: string;
  poster: string | null;
  pct: number;
  season?: number;
  episode?: number;
  updatedAt?: number;
}

function getContinueWatching(): CWItem[] {
  if (typeof window === "undefined") return [];
  const items: CWItem[] = [];
  const seenIds = new Set<number>();

  try {
    // 1. Single-pass read and parse of localStorage keys
    let hist: Array<{ id?: number; title?: string; name?: string; poster?: string; poster_path?: string; progress?: number; type?: string; season?: number; episode?: number; updatedAt?: number }> = [];
    try {
      const raw = localStorage.getItem("sh_history");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) hist = parsed;
      }
    } catch {}

    let wl: Array<{ id?: number; title?: string; name?: string; poster?: string; poster_path?: string }> = [];
    try {
      const raw = localStorage.getItem("sh_watchlist");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) wl = parsed;
      }
    } catch {}

    let vl: Record<string, { title?: string; poster?: string; show_progress?: Record<string, { progress?: { watched?: number; duration?: number }; updatedAt?: number }>; progress?: { watched?: number; duration?: number }; updatedAt?: number }> = {};
    try {
      const raw = localStorage.getItem("vidLinkProgress");
      if (raw) vl = JSON.parse(raw) || {};
    } catch {}

    let store: Record<string, { id?: number; type?: string; season?: number; episode?: number; pct?: number; progress?: number; duration?: number; currentTime?: number; poster?: string; title?: string; updatedAt?: number }> = {};
    try {
      const raw = localStorage.getItem("sh_progress_store");
      if (raw) store = JSON.parse(raw) || {};
    } catch {}

    // 2. Build lookup maps from pre-parsed items
    const posterMap = new Map<number, string>();
    const titleMap = new Map<number, string>();

    for (const h of hist) {
      const p = h.poster || h.poster_path;
      if (h.id && p && !posterMap.has(h.id)) posterMap.set(h.id, p);
      const t = h.title || h.name;
      if (h.id && t && !titleMap.has(h.id)) titleMap.set(h.id, t);
    }

    for (const w of wl) {
      const p = w.poster || w.poster_path;
      if (w.id && p && !posterMap.has(w.id)) posterMap.set(w.id, p);
      const t = w.title || w.name;
      if (w.id && t && !titleMap.has(w.id)) titleMap.set(w.id, t);
    }

    for (const [idStr, val] of Object.entries(vl)) {
      const id = parseInt(idStr, 10);
      if (id && val?.poster && !posterMap.has(id)) posterMap.set(id, val.poster);
      if (id && val?.title && !titleMap.has(id)) titleMap.set(id, val.title);
    }

    // 3. Candidate items collected from all sources
    const candidates: CWItem[] = [];

    // Source A: sh_progress_store
    for (const [k, v] of Object.entries(store)) {
      if (!v) continue;
      const isTv = v.type === "tv" || k.includes("_s");
      let id = v.id || parseInt(k, 10);
      let s = v.season || 1;
      let e = v.episode || 1;
      if (isTv && (!v.season || !v.episode)) {
        const parts = k.split("_s");
        id = parseInt(parts[0], 10) || id;
        const epParts = (parts[1] || "").split("e");
        s = parseInt(epParts[0], 10) || 1;
        e = parseInt(epParts[1], 10) || 1;
      }
      if (isNaN(id)) continue;

      const pctRaw = typeof v.pct === "number" ? v.pct : (typeof v.progress === "number" ? v.progress : (v.duration && v.duration > 0 && v.currentTime && v.currentTime > 0 ? (v.currentTime / v.duration) * 100 : 2));
      const pct = Math.min(100, Math.max(1, Math.round(pctRaw)));

      // If finished (>= 98%), skip
      if (pct >= 98) continue;

      const poster = v.poster || posterMap.get(id) || null;
      const title = v.title || titleMap.get(id) || (isTv ? `Series (S${s} E${e})` : "Movie");

      candidates.push({
        id,
        type: isTv ? "tv" : "movie",
        title,
        poster,
        pct,
        season: isTv ? s : undefined,
        episode: isTv ? e : undefined,
        updatedAt: v.updatedAt || 0,
      });
    }

    // Source B: vidLinkProgress
    for (const [rawId, data] of Object.entries(vl)) {
      const id = parseInt(rawId, 10);
      if (isNaN(id) || !data) continue;
      if (data.show_progress) {
        for (const [epKey, ep] of Object.entries(data.show_progress)) {
          if (ep?.progress?.duration && ep.progress.duration > 0 && typeof ep.progress.watched === "number") {
            const pct = Math.min(100, Math.max(1, Math.round((ep.progress.watched / ep.progress.duration) * 100)));
            if (pct > 0 && pct < 98) {
              const match = epKey.match(/^s(\d+)e(\d+)$/);
              const s = match ? parseInt(match[1], 10) : 1;
              const e = match ? parseInt(match[2], 10) : 1;
              candidates.push({
                id,
                type: "tv",
                title: data.title || titleMap.get(id) || `Series (S${s} E${e})`,
                poster: data.poster || posterMap.get(id) || null,
                pct,
                season: s,
                episode: e,
                updatedAt: ep.updatedAt || 0,
              });
            }
          }
        }
      } else if (data.progress?.duration && data.progress.duration > 0 && typeof data.progress.watched === "number") {
        const pct = Math.min(100, Math.max(1, Math.round((data.progress.watched / data.progress.duration) * 100)));
        if (pct > 0 && pct < 98) {
          candidates.push({
            id,
            type: "movie",
            title: data.title || titleMap.get(id) || "Movie",
            poster: data.poster || posterMap.get(id) || null,
            pct,
            updatedAt: data.updatedAt || 0,
          });
        }
      }
    }

    // Source C: sh_history (fallback for recently watched items, using pre-parsed array)
    for (const h of hist) {
      if (!h || !h.id) continue;
      if (typeof h.progress === "number" && h.progress >= 98) continue;
      const isTv = h.type === "tv" || Boolean(h.season);
      const pct = h.progress && h.progress > 0 ? Math.min(100, Math.round(h.progress)) : 2;
      candidates.push({
        id: h.id,
        type: isTv ? "tv" : "movie",
        title: h.title || h.name || titleMap.get(h.id) || "Untitled",
        poster: h.poster || h.poster_path || posterMap.get(h.id) || null,
        pct,
        season: isTv ? (h.season || 1) : undefined,
        episode: isTv ? (h.episode || 1) : undefined,
        updatedAt: h.updatedAt || 0,
      });
    }

    // Sort all candidates by most recently watched
    candidates.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // Deduplicate by item.id so each movie or show appears only ONCE at its latest watch point
    for (const cand of candidates) {
      if (!seenIds.has(cand.id)) {
        seenIds.add(cand.id);
        items.push(cand);
      }
    }
  } catch {}

  return items.slice(0, 15);
}

async function enrichCWPosters(items: CWItem[]): Promise<CWItem[]> {
  const missing = items.filter((i) => !i.poster);
  if (missing.length === 0) return items;
  const patches = await Promise.all(
    missing.map(async (item) => {
      try {
        const d = await getDetail(item.id, item.type);
        if (d?.poster_path) return { id: item.id, poster: d.poster_path as string, title: (d.title || d.name) as string };
      } catch {}
      return null;
    })
  );
  const valid = patches.filter(Boolean) as { id: number; poster: string; title?: string }[];
  if (valid.length === 0) return items;

  // Persist resolved posters and titles back to localStorage so subsequent loads are instant
  try {
    const store = JSON.parse(localStorage.getItem("sh_progress_store") || "{}");
    let changed = false;
    for (const p of valid) {
      for (const [k, v] of Object.entries(store) as [string, { id?: number; poster?: string; title?: string }][]) {
        if (v && (v.id === p.id || k === String(p.id) || k.startsWith(`${p.id}_`))) {
          if (!v.poster) {
            v.poster = p.poster;
            changed = true;
          }
          if (p.title && (!v.title || v.title === "Movie" || v.title.startsWith("Series"))) {
            v.title = p.title;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      localStorage.setItem("sh_progress_store", JSON.stringify(store));
    }

    // Backfill real titles/posters into history entries seeded from legacy progress
    const hist: HistoryItem[] = JSON.parse(localStorage.getItem("sh_history") || "[]");
    let histChanged = false;
    if (hist.length > 0) {
      for (const p of valid) {
        for (const h of hist) {
          if (h && Number(h.id) === Number(p.id) && (!h.poster || !h.title || h.title === "Movie" || h.title.startsWith("Series"))) {
            if (p.poster && !h.poster) { h.poster = p.poster; }
            if (p.title && (!h.title || h.title === "Movie" || h.title.startsWith("Series"))) h.title = p.title;
            histChanged = true;
          }
        }
      }
      if (histChanged) {
        localStorage.setItem("sh_history", JSON.stringify(hist));
        useStore.setState({ history: hist });
      }
    }
  } catch {}

  return items.map((item) => {
    const patch = valid.find((v) => v.id === item.id);
    if (!patch) return item;
    return {
      ...item,
      poster: patch.poster,
      title: item.title === "Movie" || item.title.startsWith("Series") ? (patch.title || item.title) : item.title,
    };
  });
}

function SyncedToggle({
  labels,
  activeIndex,
  onToggle,
  className = "",
}: {
  labels: string[];
  activeIndex: number;
  onToggle: (index: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const isInitial = useRef(true);

  const sync = useCallback((animate = true) => {
    const indicator = indicatorRef.current;
    const btns = Array.from(containerRef.current?.querySelectorAll(".bgt-btn") || []) as HTMLElement[];
    const activeBtn = btns[activeIndex];
    if (!indicator || !activeBtn) return;

    // Use offsetLeft directly (no scrollLeft subtraction) so indicator scrolls with content
    const targetLeft = activeBtn.offsetLeft;
    const targetWidth = activeBtn.offsetWidth;

    if (!animate) {
      indicator.getAnimations().forEach((a) => a.cancel());
      indicator.style.transition = "none";
      indicator.style.left = `${targetLeft}px`;
      indicator.style.width = `${targetWidth}px`;
      void indicator.offsetHeight; // Force reflow
      indicator.style.transition = "";
      return;
    }

    const cs = getComputedStyle(indicator);
    const fromLeft = parseFloat(cs.left) || 0;
    const fromWidth = parseFloat(cs.width) || 0;
    if (Math.abs(fromLeft - targetLeft) > 0.5 || Math.abs(fromWidth - targetWidth) > 0.5) {
      indicator.style.left = cs.left;
      indicator.style.width = cs.width;
      indicator.getAnimations().forEach((a) => a.cancel());
      indicator.animate(
        [
          { left: `${fromLeft}px`, width: `${fromWidth}px` },
          { left: `${targetLeft}px`, width: `${targetWidth}px` },
        ],
        { duration: 260, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "forwards" }
      );
      return;
    }

    indicator.style.left = `${targetLeft}px`;
    indicator.style.width = `${targetWidth}px`;
  }, [activeIndex]);

  useLayoutEffect(() => {
    if (isInitial.current) {
      sync(false);
      isInitial.current = false;
    } else {
      sync(true);
    }
  }, [sync]);

  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  useEffect(() => {
    const handleResize = () => syncRef.current(false);
    const container = containerRef.current;
    const handleScroll = () => syncRef.current(false);
    window.addEventListener("resize", handleResize, { passive: true });
    container?.addEventListener("scroll", handleScroll, { passive: true });
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => syncRef.current(false));
    }
    return () => {
      window.removeEventListener("resize", handleResize);
      container?.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleClick = (i: number, el: HTMLElement) => {
    const container = containerRef.current;
    if (container) {
      container.querySelectorAll(".bgt-btn").forEach((b) => b.classList.remove("active"));
      el.classList.add("active");
      // Center the button in the scroll container
      const scrollLeftTarget = el.offsetLeft - container.clientWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollLeftTarget), behavior: "smooth" });
    }
    onToggle(i);
  };

  return (
    <div className={`by-genre-toggle ${className}`} ref={containerRef} style={{ position: "relative" }}>
      <div className="bgt-indicator" ref={indicatorRef} />
      {labels.map((label, i) => (
        <div
          key={i}
          className={`bgt-btn${i === activeIndex ? " active" : ""}`}
          onClick={(e) => handleClick(i, e.currentTarget)}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function GenrePillRow({
  genres,
  activeGenreId,
  onGenreSelect,
}: {
  genres: { id: number; name: string }[];
  activeGenreId: number | null;
  onGenreSelect: (id: number | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const isInitial = useRef(true);

  const getActiveBtn = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    const btns = Array.from(container.querySelectorAll(".genre-sq-btn")) as HTMLElement[];
    const gIdx = activeGenreId === null ? -1 : genres.findIndex((g) => g.id === activeGenreId);
    const activeIdx = activeGenreId === null ? 0 : (gIdx >= 0 ? gIdx + 1 : 0);
    return btns[activeIdx] || btns[0] || null;
  }, [activeGenreId, genres]);

  const sync = useCallback((animate = true) => {
    const indicator = indicatorRef.current;
    const activeBtn = getActiveBtn();
    if (!indicator || !activeBtn) return;

    const tLeft = activeBtn.offsetLeft;
    const tTop = activeBtn.offsetTop;
    const tWidth = activeBtn.offsetWidth;
    const tHeight = activeBtn.offsetHeight;

    if (!animate) {
      indicator.getAnimations().forEach((a) => a.cancel());
      indicator.style.transition = "none";
      indicator.style.left = `${tLeft}px`;
      indicator.style.top = `${tTop}px`;
      indicator.style.width = `${tWidth}px`;
      indicator.style.height = `${tHeight}px`;
      void indicator.offsetHeight; // Force reflow
      indicator.style.transition = "";
      return;
    }

    const cs = getComputedStyle(indicator);
    const fromL = parseFloat(cs.left) || 0;
    const fromT = parseFloat(cs.top) || 0;
    const fromW = parseFloat(cs.width) || 0;
    const fromH = parseFloat(cs.height) || 0;
    if (
      Math.abs(fromL - tLeft) > 0.5 ||
      Math.abs(fromT - tTop) > 0.5 ||
      Math.abs(fromW - tWidth) > 0.5 ||
      Math.abs(fromH - tHeight) > 0.5
    ) {
      indicator.style.left = cs.left;
      indicator.style.top = cs.top;
      indicator.style.width = cs.width;
      indicator.style.height = cs.height;
      indicator.getAnimations().forEach((a) => a.cancel());
      indicator.animate(
        [
          {
            left: `${fromL}px`,
            top: `${fromT}px`,
            width: `${fromW}px`,
            height: `${fromH}px`,
          },
          { left: `${tLeft}px`, top: `${tTop}px`, width: `${tWidth}px`, height: `${tHeight}px` },
        ],
        { duration: 260, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "forwards" }
      );
      return;
    }

    indicator.style.left = `${tLeft}px`;
    indicator.style.top = `${tTop}px`;
    indicator.style.width = `${tWidth}px`;
    indicator.style.height = `${tHeight}px`;
  }, [getActiveBtn]);

  useLayoutEffect(() => {
    if (isInitial.current) {
      sync(false);
      isInitial.current = false;
    } else {
      sync(true);
    }
  }, [sync]);

  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  useEffect(() => {
    const handleResize = () => syncRef.current(false);
    window.addEventListener("resize", handleResize, { passive: true });
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => syncRef.current(false));
    }
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleClick = (id: number | null, el: HTMLDivElement) => {
    const container = containerRef.current;
    if (container) {
      container.querySelectorAll(".genre-sq-btn").forEach((b) => b.classList.remove("active"));
      el.classList.add("active");
      const scrollLeftTarget = el.offsetLeft - container.clientWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollLeftTarget), behavior: "smooth" });
    }
    onGenreSelect(id);
  };

  return (
    <div className="genre-btn-scroll" id="home-genre-btns" ref={containerRef} style={{ position: "relative" }}>
      <div className="genre-sq-indicator" ref={indicatorRef} />
      <div
        className={`genre-sq-btn${activeGenreId === null ? " active" : ""}`}
        onClick={(e) => handleClick(null, e.currentTarget)}
      >
        ALL
      </div>
      {genres.map((g) => (
        <div
          key={g.id}
          className={`genre-sq-btn${activeGenreId === g.id ? " active" : ""}`}
          onClick={(e) => handleClick(g.id, e.currentTarget)}
        >
          {g.name}
        </div>
      ))}
    </div>
  );
}

function SpotlightCarousel({ items }: { items: MediaItem[] }) {
  const [current, setCurrent] = useState(0);
  const [trailers, setTrailers] = useState<Record<number, TrailerSource | null>>({});
  const trailersRef = useRef(trailers);
  useEffect(() => {
    trailersRef.current = trailers;
  });
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isPlayingRef = useRef(false);
  const isLoopingRef = useRef(false);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { openDetail, watchlist, addToWatchlist, removeFromWatchlist, user, openAuth } = useStore((s) => s);

  const activeItem = items[current];
  const inWl = activeItem ? watchlist.some((w) => w.id === activeItem.id) : false;
  const activeTrailer = activeItem ? trailers[activeItem.id] : null;

  // Pre-fetch trailers (MP4 or official YouTube key) for all spotlight items
  useEffect(() => {
    if (!items || items.length === 0) return;

    items.forEach((it) => {
      const id = it.id;
      if (trailersRef.current[id] !== undefined) return;
      getTrailerSource(id, it.media_type || "movie")
        .then((source) => {
          setTrailers((prev) => (prev[id] !== undefined ? prev : { ...prev, [id]: source }));
        })
        .catch(() => {
          setTrailers((prev) => (prev[id] !== undefined ? prev : { ...prev, [id]: null }));
        });
    });
  }, [items]);

  // Handle active video playback on slide rotation
  useEffect(() => {
    setIsVideoLoaded(false);
    isPlayingRef.current = false;
    isLoopingRef.current = false;
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    if (activeTrailer?.type === "mp4") {
      const video = videoRef.current;
      if (video) {
        video.muted = isMuted;
        video.defaultMuted = true;
        video.playsInline = true;
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    } else if (activeTrailer?.type === "youtube") {
      // Send handshake listening message so YouTube delivers playerState and time updates
      setTimeout(() => {
        try {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ event: "listening", id: 1 }),
            "*"
          );
        } catch {}
      }, 150);
    }
  }, [current, activeTrailer, isMuted]);

  // Global user interaction resume: triggers autoplay ONLY for native MP4 video
  useEffect(() => {
    const handleResume = () => {
      if (activeTrailer?.type === "mp4" && videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
    };
    const handleVis = () => {
      if (!document.hidden) handleResume();
    };
    window.addEventListener("pointerdown", handleResume, { passive: true });
    window.addEventListener("keydown", handleResume, { passive: true });
    document.addEventListener("visibilitychange", handleVis);
    return () => {
      window.removeEventListener("pointerdown", handleResume);
      window.removeEventListener("keydown", handleResume);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, [activeTrailer]);

  // Seamless auto-loop and auto-resume for YouTube iframe (eliminates pause button and transport HUD)
  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (!data) return;

        let playerState: number | undefined = undefined;
        if (typeof data.info === "number") {
          playerState = data.info;
        } else if (data.info && typeof data.info.playerState === "number") {
          playerState = data.info.playerState;
        }

        // Proactive seamless loop: if video is within 0.8s of the end, seek back to 0
        // Using seekTo directly without playVideo avoids re-triggering YouTube's pause button overlay
        if (data.info && typeof data.info.currentTime === "number" && typeof data.info.duration === "number") {
          const { currentTime, duration } = data.info;
          if (duration > 3 && currentTime >= duration - 0.8 && !isLoopingRef.current) {
            isLoopingRef.current = true;
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "command", func: "seekTo", args: [0, true] }),
              "*"
            );
            setTimeout(() => {
              isLoopingRef.current = false;
            }, 1500);
            return;
          }
        }

        // 1 = PLAYING: Video is actively running. Reveal smoothly once YouTube's startup pause bezel has fully faded
        if (playerState === 1) {
          isPlayingRef.current = true;
          if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
          revealTimerRef.current = setTimeout(() => {
            if (isPlayingRef.current) {
              setIsVideoLoaded(true);
            }
          }, 1100);
        }

        // 2 = PAUSED: If video pauses or autoplay is restricted, hide immediately so pause bezel/shadow is NEVER shown
        if (playerState === 2) {
          isPlayingRef.current = false;
          if (revealTimerRef.current) {
            clearTimeout(revealTimerRef.current);
            revealTimerRef.current = null;
          }
          setIsVideoLoaded(false);
        }

        // 3 = BUFFERING: Don't prematurely reveal if video stalled
        if (playerState === 3 && !isPlayingRef.current) {
          if (revealTimerRef.current) {
            clearTimeout(revealTimerRef.current);
            revealTimerRef.current = null;
          }
        }

        // 0 = ENDED: restart seamlessly from beginning
        if (playerState === 0) {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: "seekTo", args: [0, true] }),
            "*"
          );
        }
      } catch {}
    };
    window.addEventListener("message", handleMsg);

    return () => {
      window.removeEventListener("message", handleMsg);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  // Audio mute/unmute toggle — works for both native video and YouTube iframe
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (activeTrailer?.type === "mp4" && videoRef.current) {
      videoRef.current.muted = nextMuted;
    } else if (activeTrailer?.type === "youtube" && iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: nextMuted ? "mute" : "unMute",
            args: [],
          }),
          "*"
        );
      } catch {}
    }
  };

  const [animKey, setAnimKey] = useState(0);
  const startTimeRef = useRef<number>(0);
  const remainingRef = useRef<number>(CFG.SPOTLIGHT_INTERVAL);

  const goToSlide = useCallback((index: number) => {
    setCurrent(index);
    setAnimKey((k) => k + 1);
    remainingRef.current = CFG.SPOTLIGHT_INTERVAL;
    startTimeRef.current = Date.now();
  }, []);

  const nextSlide = useCallback(() => {
    goToSlide((current + 1) % items.length);
  }, [current, items.length, goToSlide]);

  const prevSlide = useCallback(() => {
    goToSlide((current - 1 + items.length) % items.length);
  }, [current, items.length, goToSlide]);

  // Progressive dynamic slide rotation timer: pauses precisely when hovered and resumes seamlessly
  useEffect(() => {
    if (items.length <= 1) return;

    if (isHovered) {
      if (startTimeRef.current > 0) {
        const elapsed = Date.now() - startTimeRef.current;
        remainingRef.current = Math.max(500, remainingRef.current - elapsed);
      }
      return;
    }

    startTimeRef.current = Date.now();
    const timer = setTimeout(() => {
      goToSlide((current + 1) % items.length);
    }, remainingRef.current);

    return () => clearTimeout(timer);
  }, [items.length, isHovered, current, animKey, goToSlide]);

  const getGenreName = (item: MediaItem) => {
    if (item.genre_ids && item.genre_ids.length > 0) {
      const g = CFG.GENRES.find((x) => x.id === item.genre_ids![0]);
      if (g) return g.name;
    }
    return item.media_type === "tv" ? "TV Series" : "Action";
  };

  const toggleWl = (item: MediaItem) => {
    const itemTitle = item.title || item.name || "Untitled";
    if (inWl) {
      removeFromWatchlist(item.id);
      showToast(`Removed "${itemTitle}" from Watchlist`, "info");
    } else {
      if (!user) {
        showToast("Please sign in to add to your watchlist", "info");
        openAuth();
        return;
      }
      addToWatchlist({
        id: item.id,
        type: item.media_type || "movie",
        title: itemTitle,
        poster: item.poster_path,
        vote: item.vote_average || 0,
        date: item.release_date || item.first_air_date || "",
        addedAt: Date.now(),
      });
      showToast(`Added "${itemTitle}" to Watchlist`, "success");
    }
  };

  if (!items || items.length === 0) {
    return (
      <section className="spotlight-section cinejoy-spotlight is-loading" id="spotlight-section">
        <div
          className="spotlight-skeleton"
          style={{
            width: "100%",
            height: "100%",
            background: "radial-gradient(ellipse at 70% 30%, rgba(40, 25, 65, 0.4), rgba(10, 10, 18, 0.98))",
          }}
        />
      </section>
    );
  }

  return (
    <section
      className="spotlight-section cinejoy-spotlight"
      id="spotlight-section"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="spotlight-track" id="spotlight-track" style={{ transform: `translateX(-${current * 100}%)` }}>
        {items.map((item, i) => {
          const isActive = i === current;
          const hasTrailer = Boolean(trailers[item.id]);
          const releaseYear = (item.release_date || item.first_air_date || "2026").slice(0, 4);
          const ratingVal = item.vote_average ? `${item.vote_average.toFixed(1)}/10` : "8.0/10";
          const genreName = getGenreName(item);

          return (
            <div key={item.id} className={`spotlight-slide${isActive ? " active" : ""}`}>
              {/* Spotlight poster backdrop: Visible by default; smoothly fades when native or YouTube trailer plays */}
              <div
                className="spotlight-bg"
                style={{
                  backgroundImage: `url(${IMG.backdrop(item.backdrop_path, "w1280") || IMG.backdrop(item.backdrop_path, "original") || IMG.poster(item.poster_path, "w780") || ""})`,
                  opacity: isActive && hasTrailer && isVideoLoaded ? 0 : 1,
                  transition: "opacity 0.8s ease, transform 8s ease",
                }}
              >
                {i === 0 && (
                  <img
                    src={IMG.backdrop(item.backdrop_path, "w1280") || IMG.backdrop(item.backdrop_path, "original") || IMG.poster(item.poster_path, "w780") || ""}
                    alt=""
                    aria-hidden="true"
                    fetchPriority="high"
                    loading="eager"
                    decoding="async"
                    style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                  />
                )}
              </div>

              {/* Dynamic Cinematic Video Trailer (Native MP4 or Chromeless YouTube Embed) */}
              {isActive && activeTrailer ? (
                <div className={`spotlight-video-bg${isVideoLoaded ? " is-loaded" : ""}`}>
                  {activeTrailer.type === "mp4" ? (
                    <video
                      ref={videoRef}
                      key={activeTrailer.src}
                      className="spotlight-video-el"
                      src={activeTrailer.src}
                      playsInline
                      webkit-playsinline="true"
                      muted={isMuted}
                      loop
                      autoPlay
                      preload="auto"
                      onPlaying={() => setIsVideoLoaded(true)}
                      onCanPlay={() => setIsVideoLoaded(true)}
                      onLoadedData={() => setIsVideoLoaded(true)}
                      onTimeUpdate={(e) => {
                        if (e.currentTarget.currentTime > 0) {
                          setIsVideoLoaded(true);
                        }
                      }}
                    />
                  ) : (
                    <iframe
                      ref={iframeRef}
                      key={activeTrailer.src}
                      className="spotlight-video-iframe"
                      src={`https://www.youtube-nocookie.com/embed/${activeTrailer.src}?autoplay=1&mute=1&controls=0&playsinline=1&enablejsapi=1&rel=0&iv_load_policy=3&disablekb=1&modestbranding=1&fs=0&cc_load_policy=0&origin=${encodeURIComponent(typeof window !== "undefined" && window.location.origin && window.location.origin !== "null" ? window.location.origin : "https://cinecub.stream")}`}
                      allow="autoplay; encrypted-media"
                      tabIndex={-1}
                      title="Spotlight Trailer"
                      onLoad={() => {
                        try {
                          iframeRef.current?.contentWindow?.postMessage(
                            JSON.stringify({ event: "listening", id: 1 }),
                            "*"
                          );
                        } catch {}
                      }}
                    />
                  )}
                </div>
              ) : null}

              {/* Touch & click shield: intercepts all gestures and clicks so the YouTube iframe cannot be clicked or paused */}
              <div
                className="spotlight-touch-shield"
                onClick={() => openDetail(item.id, item.media_type || "movie")}
              />

              {/* Foreground content: Title, Metadata, Overview at Top, Action Buttons */}
              <div className="spotlight-content cinejoy-hero-content">
                <h2 className="spotlight-title cinejoy-hero-title">{item.title || item.name}</h2>

                {/* Metadata row directly below Title: ★ 8.0/10 · 📅 2026 · ⚔ Action */}
                <div className="spotlight-meta cinejoy-hero-meta">
                  <span className="hero-rating"><i className="fas fa-star" /> {ratingVal}</span>
                  <span className="hero-separator">·</span>
                  <span className="hero-year"><i className="far fa-calendar-alt" /> {releaseYear}</span>
                  <span className="hero-separator">·</span>
                  <span className="hero-genre"><i className="fas fa-crosshairs" /> {genreName}</span>
                  <span className="spotlight-quality">4K HDR</span>
                </div>

                {/* OVERVIEW / SYNOPSIS: Positioned prominently at the top of the page above other content sections */}
                <p className="spotlight-desc cinejoy-hero-overview">{item.overview || "Stream this title in stunning 4K and Full HD resolution with high-speed playback and multi-audio support."}</p>

                {/* Action Buttons: [ ▶ Play ] [ ❤ ] [ ℹ ] */}
                <div className="spotlight-actions cinejoy-hero-actions">
                  <button
                    type="button"
                    className="btn-cinejoy-play"
                    onClick={() => openDetail(item.id, item.media_type || "movie")}
                    title="Watch Movie or Series"
                  >
                    <i className="fas fa-play" /> <span>Play</span>
                  </button>

                  <button
                    type="button"
                    className={`btn-cinejoy-icon${inWl ? " in-watchlist" : ""}`}
                    onClick={() => toggleWl(item)}
                    title={inWl ? "Remove from Watchlist" : "Add to Watchlist"}
                    aria-label="Toggle Watchlist"
                  >
                    <i className={inWl ? "fa-solid fa-heart" : "fa-regular fa-heart"} />
                  </button>

                  <button
                    type="button"
                    className="btn-cinejoy-icon"
                    onClick={() => openDetail(item.id, item.media_type || "movie")}
                    title="More Information"
                    aria-label="More Info"
                  >
                    <i className="fas fa-info" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hero Bottom-Right Controls: Sound Mute Toggle and Slide Indicator Dots */}
      <div className="cinejoy-hero-controls-right">
        {activeTrailer ? (
          <button
            type="button"
            className="cinejoy-hero-mute-btn"
            onClick={toggleMute}
            title={isMuted ? "Unmute Cinematic Audio" : "Mute Audio"}
            aria-label={isMuted ? "Unmute Cinematic Audio" : "Mute Audio"}
          >
            <i className={`fas ${isMuted ? "fa-volume-mute" : "fa-volume-up"}`} />
          </button>
        ) : null}

        <div className={`spotlight-dots cinejoy-dots${isHovered ? " is-paused" : ""}`} id="spotlight-dots">
          {items.map((_, i) => {
            const isActive = i === current;
            return (
              <button
                key={i}
                type="button"
                className={`spotlight-dot${isActive ? " active" : ""}`}
                onClick={() => goToSlide(i)}
                title={`Slide ${i + 1}`}
                aria-label={`Go to slide ${i + 1}`}
              >
                {isActive && (
                  <span
                    key={`fill-${current}-${animKey}`}
                    className={`spotlight-dot-fill${isHovered ? " is-paused" : ""}`}
                    style={{ animationDuration: `${CFG.SPOTLIGHT_INTERVAL}ms` }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Side Navigation Arrows */}
      <button
        aria-label="Previous slide"
        className="spotlight-nav-btn prev"
        onClick={prevSlide}
      >
        <i className="fas fa-chevron-left" />
      </button>
      <button
        aria-label="Next slide"
        className="spotlight-nav-btn next"
        onClick={nextSlide}
      >
        <i className="fas fa-chevron-right" />
      </button>
    </section>
  );
}

function SectionRow({ id, title, subtitle, icon, iconBg, iconColor, items, type, children, viewAll, onLoadMore, hasMore, isLoadingMore }: {
  id?: string; title: string; subtitle?: string; icon?: string; iconBg?: string; iconColor?: string;
  items: MediaItem[]; type?: string; children?: React.ReactNode; viewAll?: () => void;
  onLoadMore?: () => void; hasMore?: boolean; isLoadingMore?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <section className="section-wrapper" id={id}>
      <div className="section-header">
        <div className="section-title-group">
          <div className="section-icon" style={{ background: iconBg, color: iconColor }}>
            <i className={`fas ${icon}`} />
          </div>
          <div>
            <h2 className="section-title">{title}</h2>
            {subtitle && <div className="section-subtitle">{subtitle}</div>}
          </div>
        </div>
        {viewAll && (
          <div className="section-view-all" onClick={viewAll}>
            View All <i className="fas fa-arrow-right" />
          </div>
        )}
      </div>
      {children || (
        <HScrollWrapper
          id={id ? `row-${id.replace("section-", "")}` : undefined}
          scrollRef={scrollRef}
          onLoadMore={onLoadMore}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
        >
          {items.map((item) => (
            <PosterCard key={`${item.id}-${item.media_type || type || "item"}`} item={item} type={type} />
          ))}
        </HScrollWrapper>
      )}
    </section>
  );
}

const TRENDING_FILTERS = ["TODAY", "THIS WEEK"] as const;
const POPULAR_FILTERS = ["ALL MOVIES", "IN THEATRES", "ACTION", "COMEDY", "SCI-FI"] as const;

const popularFilterKey = ["movies", "now_playing", "action", "comedy", "scifi"] as const;
type PopularFilterKey = typeof popularFilterKey[number];

function getPopularFetch(filter: PopularFilterKey, page: number) {
  switch (filter) {
    case "now_playing":
      return tmdbFetch("/movie/now_playing", { page });
    case "action":
      return tmdbFetch("/discover/movie", { with_genres: 28, sort_by: "popularity.desc", page });
    case "comedy":
      return tmdbFetch("/discover/movie", { with_genres: 35, sort_by: "popularity.desc", page });
    case "scifi":
      return tmdbFetch("/discover/movie", { with_genres: 878, sort_by: "popularity.desc", page });
    default:
      return getPopular("movie", page);
  }
}

export default function HomePage() {
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [trendingPage, setTrendingPage] = useState(2);
  const [trendingHasMore, setTrendingHasMore] = useState(true);
  const [trendingLoadingMore, setTrendingLoadingMore] = useState(false);
  const trendingFetchingRef = useRef(false);

  const [popular, setPopular] = useState<MediaItem[]>([]);
  const [popularPage, setPopularPage] = useState(2);
  const [popularHasMore, setPopularHasMore] = useState(true);
  const [popularLoadingMore, setPopularLoadingMore] = useState(false);
  const popularFetchingRef = useRef(false);

  const [topRated, setTopRated] = useState<MediaItem[]>([]);

  const [tvShows, setTvShows] = useState<MediaItem[]>([]);
  const [tvPage, setTvPage] = useState(2);
  const [tvHasMore, setTvHasMore] = useState(true);
  const [tvLoadingMore, setTvLoadingMore] = useState(false);
  const tvFetchingRef = useRef(false);

  const [newReleases, setNewReleases] = useState<MediaItem[]>([]);
  const [nrPage, setNrPage] = useState(2);
  const [nrHasMore, setNrHasMore] = useState(true);
  const [nrLoadingMore, setNrLoadingMore] = useState(false);
  const nrFetchingRef = useRef(false);

  const [anime, setAnime] = useState<MediaItem[]>([]);
  const [animePage, setAnimePage] = useState(2);
  const [animeHasMore, setAnimeHasMore] = useState(true);
  const [animeLoadingMore, setAnimeLoadingMore] = useState(false);
  const animeFetchingRef = useRef(false);

  const [trailers, setTrailers] = useState<MediaItem[]>([]);
  const trailersPageRef = useRef(3);
  const [trailersHasMore, setTrailersHasMore] = useState(true);
  const [trailersLoadingMore, setTrailersLoadingMore] = useState(false);
  const trailersFetchingRef = useRef(false);
  const trailersScrollRef = useRef<HTMLDivElement>(null);

  const [trendingTimeIdx, setTrendingTimeIdx] = useState(0);
  const [popularFilterIdx, setPopularFilterIdx] = useState(0);
  const [selectedGenreId, setSelectedGenreId] = useState<number | null>(null);

  const [genreResults, setGenreResults] = useState<MediaItem[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [genrePage, setGenrePage] = useState(2);
  const [genreHasMore, setGenreHasMore] = useState(true);
  const [genreLoadingMore, setGenreLoadingMore] = useState(false);
  const genreFetchingRef = useRef(false);

  const [cwItems, setCwItems] = useState<CWItem[]>([]);
  const cwScrollRef = useRef<HTMLDivElement>(null);
  const genreScrollRef = useRef<HTMLDivElement>(null);
  const trendingScrollRef = useRef<HTMLDivElement>(null);
  const popularScrollRef = useRef<HTMLDivElement>(null);

  const { setActivePage, setBrowseCategory, openDetail } = useStore((s) => s);

  const trendingTimeWindow = trendingTimeIdx === 0 ? "day" : "week";
  const popularFilter: PopularFilterKey = popularFilterKey[popularFilterIdx];

  type GenreTypeKey = "movie" | "tv" | "anime";
  const [genreType] = useState<GenreTypeKey>("movie");

  // Load continue watching (with poster enrichment for items missing a poster)
  const enrichIdRef = useRef(0);
  useEffect(() => {
    const items = getContinueWatching();
    setCwItems(items);
    const id = ++enrichIdRef.current;
    enrichCWPosters(items).then((enriched) => {
      if (id === enrichIdRef.current) setCwItems(enriched);
    });

    const onProgress = () => {
      const updated = getContinueWatching();
      setCwItems(updated);
      const id = ++enrichIdRef.current;
      enrichCWPosters(updated).then((enriched) => {
        if (id === enrichIdRef.current) setCwItems(enriched);
      });
    };
    window.addEventListener("playback-progress-updated", onProgress);
    window.addEventListener("storage", onProgress);
    return () => {
      window.removeEventListener("playback-progress-updated", onProgress);
      window.removeEventListener("storage", onProgress);
    };
  }, []);

  // Initial load of Top Rated, TV Shows (2 pages), New Releases (2 pages), and Anime
  useEffect(() => {
    async function load() {
      const [rtdM, rtdT, tv1, tv2, nr1, nr2, a1, a2] = await Promise.all([
        getTopRated("movie", 1),
        getTopRated("tv", 1),
        getPopular("tv", 1),
        getPopular("tv", 2),
        getUpcoming(1),
        getUpcoming(2),
        getAnime(1),
        getAnime(2),
      ]);
      const mList = (rtdM?.results || []).filter((x: MediaItem) => x.backdrop_path);
      const tList = (rtdT?.results || []).filter((x: MediaItem) => x.backdrop_path);
      const mixed: MediaItem[] = [];
      for (let i = 0; i < 4; i++) {
        if (mList[i]) { mList[i].media_type = "movie"; mixed.push(mList[i]); }
        if (tList[i]) { tList[i].media_type = "tv"; mixed.push(tList[i]); }
      }
      setTopRated(mixed.length > 0 ? mixed : (rtdM?.results?.slice(0, 8) || []));

      const tvCombined = [...(tv1?.results || []), ...(tv2?.results || [])].filter((x: MediaItem) => x && x.poster_path);
      const seenTv = new Set<number>();
      const tvDeduped: MediaItem[] = [];
      for (const item of tvCombined) {
        if (!seenTv.has(item.id)) { seenTv.add(item.id); tvDeduped.push(item); }
      }
      setTvShows(tvDeduped);

      const nrCombined = [...(nr1?.results || []), ...(nr2?.results || [])].filter((x: MediaItem) => x && x.poster_path);
      const seenNr = new Set<number>();
      const nrDeduped: MediaItem[] = [];
      for (const item of nrCombined) {
        if (!seenNr.has(item.id)) { seenNr.add(item.id); nrDeduped.push(item); }
      }
      setNewReleases(nrDeduped);

      const aCombined = [...(a1?.results || []), ...(a2?.results || [])].filter((x: MediaItem) => x && x.poster_path);
      const seenA = new Set<number>();
      const aDeduped: MediaItem[] = [];
      for (const item of aCombined) {
        if (!seenA.has(item.id)) { seenA.add(item.id); aDeduped.push(item); }
      }
      setAnime(aDeduped);
    }
    load();
  }, []);

  // Trending Now: initial load of pages 1 and 2
  useEffect(() => {
    let cancelled = false;
    trendingFetchingRef.current = false;
    setTrendingPage(2);
    setTrendingHasMore(true);

    Promise.all([
      getTrending("all", trendingTimeWindow, 1),
      getTrending("all", trendingTimeWindow, 2),
    ]).then(([res1, res2]) => {
      if (cancelled) return;
      const combined = [
        ...(res1?.results || []),
        ...(res2?.results || []),
      ].filter((x: MediaItem) => x && x.poster_path);

      const seen = new Set<string>();
      const deduped: MediaItem[] = [];
      for (const item of combined) {
        const key = (item.media_type || "movie") + "_" + item.id;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      }
      setTrending(deduped);
    }).catch(console.error);

    return () => { cancelled = true; };
  }, [trendingTimeWindow]);

  // Trending Now: infinite scroll handler
  const loadMoreTrending = useCallback(async () => {
    if (trendingFetchingRef.current || !trendingHasMore) return;
    trendingFetchingRef.current = true;
    setTrendingLoadingMore(true);
    const nextPage = trendingPage + 1;
    try {
      const data = await getTrending("all", trendingTimeWindow, nextPage);
      const results = (data?.results || []).filter((x: MediaItem) => x && x.poster_path);
      if (results.length === 0 || (data?.total_pages && nextPage >= data.total_pages)) {
        setTrendingHasMore(false);
      }
      if (results.length > 0) {
        setTrending((prev) => {
          const seen = new Set(prev.map((x) => (x.media_type || "movie") + "_" + x.id));
          const additions = results.filter((x: MediaItem) => !seen.has((x.media_type || "movie") + "_" + x.id));
          return [...prev, ...additions];
        });
        setTrendingPage(nextPage);
      }
    } catch (err) {
      console.error("loadMoreTrending error:", err);
    } finally {
      trendingFetchingRef.current = false;
      setTrendingLoadingMore(false);
    }
  }, [trendingPage, trendingHasMore, trendingTimeWindow]);

  // Popular Movies: initial load of pages 1 and 2
  useEffect(() => {
    let cancelled = false;
    popularFetchingRef.current = false;
    setPopularPage(2);
    setPopularHasMore(true);

    Promise.all([
      getPopularFetch(popularFilter, 1),
      getPopularFetch(popularFilter, 2),
    ]).then(([res1, res2]) => {
      if (cancelled) return;
      const combined = [
        ...(res1?.results || []),
        ...(res2?.results || []),
      ].filter((x: MediaItem) => x && x.poster_path);

      const seen = new Set<number>();
      const results: MediaItem[] = [];
      for (const item of combined) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          results.push(item);
        }
      }
      setPopular(results);
    }).catch(console.error);

    return () => { cancelled = true; };
  }, [popularFilter]);

  // Popular Movies: infinite scroll handler
  const loadMorePopular = useCallback(async () => {
    if (popularFetchingRef.current || !popularHasMore) return;
    popularFetchingRef.current = true;
    setPopularLoadingMore(true);
    const nextPage = popularPage + 1;
    try {
      const data = await getPopularFetch(popularFilter, nextPage);
      const results = (data?.results || []).filter((x: MediaItem) => x && x.poster_path);
      if (results.length === 0 || (data?.total_pages && nextPage >= data.total_pages)) {
        setPopularHasMore(false);
      }
      if (results.length > 0) {
        setPopular((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const additions = results.filter((x: MediaItem) => !seen.has(x.id));
          return [...prev, ...additions];
        });
        setPopularPage(nextPage);
      }
    } catch (err) {
      console.error("loadMorePopular error:", err);
    } finally {
      popularFetchingRef.current = false;
      setPopularLoadingMore(false);
    }
  }, [popularPage, popularHasMore, popularFilter]);

  // TV Shows: infinite scroll handler
  const loadMoreTvShows = useCallback(async () => {
    if (tvFetchingRef.current || !tvHasMore) return;
    tvFetchingRef.current = true;
    setTvLoadingMore(true);
    const nextPage = tvPage + 1;
    try {
      const data = await getPopular("tv", nextPage);
      const results = (data?.results || []).filter((x: MediaItem) => x && x.poster_path);
      if (results.length === 0 || (data?.total_pages && nextPage >= data.total_pages)) {
        setTvHasMore(false);
      }
      if (results.length > 0) {
        setTvShows((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const additions = results.filter((x: MediaItem) => !seen.has(x.id));
          return [...prev, ...additions];
        });
        setTvPage(nextPage);
      }
    } catch (err) {
      console.error("loadMoreTvShows error:", err);
    } finally {
      tvFetchingRef.current = false;
      setTvLoadingMore(false);
    }
  }, [tvPage, tvHasMore]);

  // New Releases: infinite scroll handler
  const loadMoreNewReleases = useCallback(async () => {
    if (nrFetchingRef.current || !nrHasMore) return;
    nrFetchingRef.current = true;
    setNrLoadingMore(true);
    const nextPage = nrPage + 1;
    try {
      const data = await getUpcoming(nextPage);
      const results = (data?.results || []).filter((x: MediaItem) => x && x.poster_path);
      if (results.length === 0 || (data?.total_pages && nextPage >= data.total_pages)) {
        setNrHasMore(false);
      }
      if (results.length > 0) {
        setNewReleases((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const additions = results.filter((x: MediaItem) => !seen.has(x.id));
          return [...prev, ...additions];
        });
        setNrPage(nextPage);
      }
    } catch (err) {
      console.error("loadMoreNewReleases error:", err);
    } finally {
      nrFetchingRef.current = false;
      setNrLoadingMore(false);
    }
  }, [nrPage, nrHasMore]);

  // Anime: infinite scroll handler
  const loadMoreAnime = useCallback(async () => {
    if (animeFetchingRef.current || !animeHasMore) return;
    animeFetchingRef.current = true;
    setAnimeLoadingMore(true);
    const nextPage = animePage + 1;
    try {
      const data = await getAnime(nextPage);
      const results = (data?.results || []).filter((x: MediaItem) => x && x.poster_path);
      if (results.length === 0 || (data?.total_pages && nextPage >= data.total_pages)) {
        setAnimeHasMore(false);
      }
      if (results.length > 0) {
        setAnime((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const additions = results.filter((x: MediaItem) => !seen.has(x.id));
          return [...prev, ...additions];
        });
        setAnimePage(nextPage);
      }
    } catch (err) {
      console.error("loadMoreAnime error:", err);
    } finally {
      animeFetchingRef.current = false;
      setAnimeLoadingMore(false);
    }
  }, [animePage, animeHasMore]);

  // Featured Cinematic Trailers: initial load of pages 1, 2, and 3 (60 items)
  useEffect(() => {
    let cancelled = false;
    trailersFetchingRef.current = false;
    trailersPageRef.current = 3;
    setTrailersHasMore(true);

    Promise.all([
      getTrending("all", "day", 1),
      getTrending("all", "day", 2),
      getTrending("all", "day", 3),
    ]).then(([res1, res2, res3]) => {
      if (cancelled) return;
      const combined = [
        ...(res1?.results || []),
        ...(res2?.results || []),
        ...(res3?.results || []),
      ].filter((x: MediaItem) => x && (x.backdrop_path || x.poster_path));

      const seen = new Set<string>();
      const deduped: MediaItem[] = [];
      for (const item of combined) {
        const key = (item.media_type || "movie") + "_" + item.id;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      }
      setTrailers(deduped);

      // Pre-fetch trailers (MP4 or YouTube key) for top cinematic trailers so playback is instant
      deduped.slice(0, 15).forEach((item) => {
        getTrailerSource(item.id, item.media_type || "movie");
      });
    }).catch(console.error);

    return () => { cancelled = true; };
  }, []);

  // Featured Cinematic Trailers: infinite scroll handler (dynamically loads unlimited)
  const loadMoreTrailers = useCallback(async () => {
    if (trailersFetchingRef.current || !trailersHasMore) return;
    trailersFetchingRef.current = true;
    setTrailersLoadingMore(true);
    const nextPage = trailersPageRef.current + 1;
    trailersPageRef.current = nextPage;
    try {
      const data = await getTrending("all", "day", nextPage);
      const results = (data?.results || []).filter((x: MediaItem) => x && (x.backdrop_path || x.poster_path));
      if (results.length === 0 || (data?.total_pages && nextPage >= data.total_pages)) {
        setTrailersHasMore(false);
      }
      if (results.length > 0) {
        setTrailers((prev) => {
          const seen = new Set(prev.map((x) => (x.media_type || "movie") + "_" + x.id));
          const additions = results.filter((x: MediaItem) => !seen.has((x.media_type || "movie") + "_" + x.id));
          return [...prev, ...additions];
        });
      }
    } catch (err) {
      console.error("loadMoreTrailers error:", err);
    } finally {
      trailersFetchingRef.current = false;
      setTrailersLoadingMore(false);
    }
  }, [trailersHasMore]);

  // Explore by Genre: initial load of pages 1 and 2
  useEffect(() => {
    let cancelled = false;
    genreFetchingRef.current = false;
    setGenrePage(2);
    setGenreHasMore(true);
    setGenreLoading(true);

    const fetchType = genreType === "anime" ? "tv" : genreType;
    const params: Record<string, string | number> = { sort_by: "popularity.desc" };

    if (genreType === "anime") {
      params.with_original_language = "ja";
      const tvGenre = selectedGenreId !== null ? (CFG.TV_GENRE_REMAP[selectedGenreId] || selectedGenreId) : null;
      params.with_genres = tvGenre !== null ? `${tvGenre},16` : "16";
    } else if (genreType === "tv") {
      if (selectedGenreId !== null) {
        params.with_genres = CFG.TV_GENRE_REMAP[selectedGenreId] || selectedGenreId;
      }
    } else if (selectedGenreId !== null) {
      params.with_genres = selectedGenreId;
    }

    Promise.all([
      tmdbFetch(`/discover/${fetchType}`, { ...params, page: 1 }),
      tmdbFetch(`/discover/${fetchType}`, { ...params, page: 2 }),
    ]).then(([res1, res2]) => {
      if (cancelled) return;
      const combined = [
        ...(res1?.results || []),
        ...(res2?.results || []),
      ].filter((item: MediaItem) => item && item.poster_path);

      const seen = new Set<number>();
      const results: MediaItem[] = [];
      for (const item of combined) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          results.push(item);
        }
      }
      setGenreResults(results);
    }).catch((err) => {
      console.error("fetchGenre error:", err);
    }).finally(() => {
      if (!cancelled) setGenreLoading(false);
    });

    genreScrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    return () => { cancelled = true; };
  }, [genreType, selectedGenreId]);

  // Explore by Genre: infinite scroll handler
  const loadMoreGenre = useCallback(async () => {
    if (genreFetchingRef.current || !genreHasMore) return;
    genreFetchingRef.current = true;
    setGenreLoadingMore(true);
    const nextPage = genrePage + 1;
    const fetchType = genreType === "anime" ? "tv" : genreType;
    const params: Record<string, string | number> = { page: nextPage, sort_by: "popularity.desc" };

    if (genreType === "anime") {
      params.with_original_language = "ja";
      const tvGenre = selectedGenreId !== null ? (CFG.TV_GENRE_REMAP[selectedGenreId] || selectedGenreId) : null;
      params.with_genres = tvGenre !== null ? `${tvGenre},16` : "16";
    } else if (genreType === "tv") {
      if (selectedGenreId !== null) {
        params.with_genres = CFG.TV_GENRE_REMAP[selectedGenreId] || selectedGenreId;
      }
    } else if (selectedGenreId !== null) {
      params.with_genres = selectedGenreId;
    }

    try {
      const data = await tmdbFetch(`/discover/${fetchType}`, params);
      const results = (data?.results || []).filter((item: MediaItem) => item && item.poster_path);
      if (results.length === 0 || (data?.total_pages && nextPage >= data.total_pages)) {
        setGenreHasMore(false);
      }
      if (results.length > 0) {
        setGenreResults((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const additions = results.filter((x: MediaItem) => !seen.has(x.id));
          return [...prev, ...additions];
        });
        setGenrePage(nextPage);
      }
    } catch (err) {
      console.error("loadMoreGenre error:", err);
    } finally {
      genreFetchingRef.current = false;
      setGenreLoadingMore(false);
    }
  }, [genrePage, genreHasMore, genreType, selectedGenreId]);

  const spotlightItems = useMemo(() => trending.slice(0, 7), [trending]);

  return (
    <>
      <h1 className="sr-only">CineCub - Watch Free Movies, Series &amp; Anime Online in Full HD</h1>
      <SpotlightCarousel items={spotlightItems} />

      <div className="cv-container">
        {/* TRENDING TICKER */}
        <div className="trending-ribbon" id="trending-ribbon">
          <div className="tr-label"><i className="fas fa-bolt" /> Trending</div>
          <div className="tr-scroll-wrap">
            <div className="tr-scroll" id="trending-scroll">
              {trending.slice(0, 20).map((item, i) => (
                <div key={item.id} className="tr-item" onClick={() => openDetail(item.id, item.media_type || "movie")}>
                  <span className="tr-item-num">#{i + 1}</span>
                  <span>{item.title || item.name}</span>
                  <span className="tr-item-rating">
                    <i className="fas fa-star" /> {item.vote_average ? item.vote_average.toFixed(1) : "N/A"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* STATS BAR */}
        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-film" /></div>
            <div><div className="stat-value" id="stat-movies">1.2M</div><div className="stat-label">Total Movies</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-tv" /></div>
            <div><div className="stat-value" id="stat-shows">230K+</div><div className="stat-label">TV Series</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-globe" /></div>
            <div><div className="stat-value">50+</div><div className="stat-label">Languages</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><i className="fas fa-video" /></div>
            <div><div className="stat-value">4K</div><div className="stat-label">Ultra HD Quality</div></div>
          </div>
        </div>

        {/* CONTINUE WATCHING SECTION (Matches Legacy #section-continue-watching) */}
        <section className="section-wrapper" id="section-continue-watching">
          <div className="section-header">
            <div className="section-title-group">
              <div className="section-icon" style={{ background: "rgba(199,125,255,0.12)", color: "var(--cv-purple-light)" }}>
                <i className="fas fa-play" />
              </div>
              <div>
                <h2 className="section-title">Continue Watching</h2>
                <div className="section-subtitle">Jump back into your recent titles</div>
              </div>
            </div>
            <div className="section-view-all" onClick={() => setActivePage("history")}>
              View History <i className="fas fa-arrow-right" />
            </div>
          </div>
          <HScrollWrapper id="row-continue-watching" scrollRef={cwScrollRef}>
            {cwItems.map((item) => (
              <ContinueWatchingCard key={`${item.id}-${item.season || 0}-${item.episode || 0}`} item={{ ...item, progress: item.pct }} />
            ))}
            {cwItems.length === 0 && (
              <div className="cw-empty-state">
                <i className="fas fa-play-circle" />
                <span>No watched titles yet. Click any movie or TV series to start streaming and it will appear here so you can resume anytime!</span>
              </div>
            )}
          </HScrollWrapper>
        </section>

        {/* FEATURED CINEMATIC TRAILERS SHELF (Repurposed poster cards area for auto-playing cinematic trailers) */}
        <section className="section-wrapper" id="section-trailers">
          <div className="section-header">
            <div className="section-title-group">
              <div className="section-icon" style={{ background: "rgba(247,37,133,0.15)", color: "var(--cv-pink)" }}>
                <i className="fas fa-film" />
              </div>
              <div>
                <h2 className="section-title">Featured Cinematic Trailers</h2>
                <div className="section-subtitle">Auto-playing trailers and blockbuster previews</div>
              </div>
            </div>
          </div>
          <HScrollWrapper
            id="row-cinematic-trailers"
            wrapperClassName="hscroll-trailers-wrapper"
            scrollRef={trailersScrollRef}
            onLoadMore={loadMoreTrailers}
            hasMore={trailersHasMore}
            isLoadingMore={trailersLoadingMore}
          >
            {(trailers.length > 0 ? trailers : trending).map((item) => (
              <CinematicTrailerCard key={`trailer-${item.media_type || "media"}-${item.id}`} item={item} />
            ))}
          </HScrollWrapper>
        </section>

        {/* BY GENRE SECTION */}
        <section className="section-wrapper by-genre-section">
          <div className="section-header">
            <div className="section-title-group">
              <div className="section-icon" style={{ background: "var(--cv-purple-dim)", color: "var(--cv-purple-light)" }}>
                <i className="fas fa-layer-group" />
              </div>
              <div>
                <h2 className="section-title">Explore by Genre</h2>
                <div className="section-subtitle">Find movies and shows by category</div>
              </div>
            </div>
          </div>

          <div className="home-genre-wrap" style={{ marginBottom: 16 }}>
            <GenrePillRow
              genres={CFG.GENRES}
              activeGenreId={selectedGenreId}
              onGenreSelect={setSelectedGenreId}
            />
          </div>

          <HScrollWrapper
            id="row-home-genre"
            scrollRef={genreScrollRef}
            style={{ minHeight: 280, marginBottom: 10 }}
            onLoadMore={loadMoreGenre}
            hasMore={genreHasMore}
            isLoadingMore={genreLoadingMore}
          >
            {genreLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <i className="fas fa-spinner fa-spin" style={{ color: "var(--cv-purple-light)" }} /> Loading titles...
              </div>
            ) : genreResults.length > 0 ? (
              genreResults.map((item) => (
                <PosterCard key={`${item.id}-${item.media_type || genreType}`} item={item} type={genreType === "anime" ? "tv" : (item.media_type || genreType)} />
              ))
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", width: "100%" }}>
                No titles found in this category.
              </div>
            )}
          </HScrollWrapper>
        </section>

        {/* TRENDING NOW ROW */}
        <section className="section-wrapper" id="section-trending">
          <div className="section-header trending-header">
            <div className="section-title-group">
              <div className="section-icon" style={{ background: "var(--cv-purple-dim)", color: "var(--cv-purple-light)" }}>
                <i className="fas fa-fire-alt" />
              </div>
              <div>
                <h2 className="section-title">Trending Now</h2>
                <div className="section-subtitle">What everyone is watching</div>
              </div>
            </div>
            <div className="section-actions-group">
              <SyncedToggle
                className="trending-toggle"
                labels={[...TRENDING_FILTERS]}
                activeIndex={trendingTimeIdx}
                onToggle={(i) => {
                  setTrendingTimeIdx(i);
                  trendingScrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
                }}
              />
              <div
                className="section-view-all"
                onClick={() => {
                  setBrowseCategory("trending");
                  setActivePage("browse");
                }}
              >
                View All <i className="fas fa-arrow-right" />
              </div>
            </div>
          </div>
          <HScrollWrapper
            id="row-trending"
            scrollRef={trendingScrollRef}
            onLoadMore={loadMoreTrending}
            hasMore={trendingHasMore}
            isLoadingMore={trendingLoadingMore}
          >
            {trending.map((item) => (
              <PosterCard key={`${item.id}-${item.media_type || "m"}`} item={item} />
            ))}
          </HScrollWrapper>
        </section>

        {/* POPULAR MOVIES SECTION */}
        <section className="section-wrapper" id="section-popular">
          <div className="section-header popular-header">
            <div className="section-title-group">
              <div className="section-icon" style={{ background: "rgba(199,125,255,0.12)", color: "var(--cv-purple-light)" }}>
                <i className="fas fa-chart-line" />
              </div>
              <div>
                <h2 className="section-title">Popular Movies</h2>
                <div className="section-subtitle">Most streamed blockbusters &amp; hits</div>
              </div>
            </div>
            <div className="section-actions-group">
              <SyncedToggle
                className="popular-toggle"
                labels={[...POPULAR_FILTERS]}
                activeIndex={popularFilterIdx}
                onToggle={(i) => {
                  setPopularFilterIdx(i);
                  popularScrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
                }}
              />
              <div
                className="section-view-all"
                onClick={() => {
                  setBrowseCategory("popular");
                  setActivePage("browse");
                }}
              >
                View All <i className="fas fa-arrow-right" />
              </div>
            </div>
          </div>
          <HScrollWrapper
            id="row-popular"
            scrollRef={popularScrollRef}
            style={{ minHeight: 280, marginBottom: 10 }}
            onLoadMore={loadMorePopular}
            hasMore={popularHasMore}
            isLoadingMore={popularLoadingMore}
          >
            {popular.map((item) => (
              <PosterCard key={`${item.id}-movie`} item={item} type="movie" />
            ))}
          </HScrollWrapper>
        </section>

        {/* TOP 10 TODAY RANKING */}
        <section className="section-wrapper">
          <div className="section-header">
            <div className="section-title-group">
              <div className="section-icon" style={{ background: "var(--cv-gold-dim)", color: "var(--cv-gold)" }}>
                <i className="fas fa-crown" />
              </div>
              <div>
                <h2 className="section-title">Top 10 Today</h2>
                <div className="section-subtitle">Most viewed in the last 24 hours</div>
              </div>
            </div>
          </div>
          <HScrollWrapper
            id="row-top10"
            className="top10-scroll-row"
            style={{ minHeight: 280, marginBottom: 10 }}
          >
            {trending.slice(0, 10).map((item, i) => (
              <Top10Card key={item.id} item={item} rank={i + 1} />
            ))}
          </HScrollWrapper>
        </section>

        {/* TOP RATED ROW */}
        <section className="section-wrapper">
          <div className="section-header">
            <div className="section-title-group">
              <div className="section-icon" style={{ background: "var(--cv-purple-dim)", color: "var(--cv-purple-light)" }}>
                <i className="fas fa-trophy" />
              </div>
              <div>
                <h2 className="section-title">Top Rated</h2>
                <div className="section-subtitle">Critically acclaimed movies &amp; series</div>
              </div>
            </div>
            <div className="section-view-all" onClick={() => { setBrowseCategory("toprated"); setActivePage("browse"); }}>
              View All <i className="fas fa-arrow-right" />
            </div>
          </div>
          <div className="landscape-grid" id="grid-toprated">
            {topRated.slice(0, 8).map((item) => (
              <LandscapeCard key={item.id} item={item} type={item.media_type || "movie"} />
            ))}
          </div>
        </section>

        {/* TV SHOWS ROW */}
        <SectionRow
          id="section-tvshows"
          title="Popular TV Series"
          subtitle="Binge-worthy TV series"
          icon="fa-tv"
          iconBg="var(--cv-purple-dim)"
          iconColor="var(--cv-purple-light)"
          items={tvShows}
          type="tv"
          onLoadMore={loadMoreTvShows}
          hasMore={tvHasMore}
          isLoadingMore={tvLoadingMore}
          viewAll={() => { setBrowseCategory("tv"); setActivePage("browse"); }}
        />

        {/* POPULAR ANIME ROW */}
        <SectionRow
          id="section-anime"
          title="Popular Anime"
          subtitle="Top Japanese animation &amp; series"
          icon="fa-dragon"
          iconBg="var(--cv-purple-dim)"
          iconColor="var(--cv-purple-light)"
          items={anime}
          type="anime"
          onLoadMore={loadMoreAnime}
          hasMore={animeHasMore}
          isLoadingMore={animeLoadingMore}
          viewAll={() => { setBrowseCategory("anime"); setActivePage("browse"); }}
        />

        {/* NEW RELEASES ROW */}
        <SectionRow
          id="section-newreleases"
          title="New Releases"
          subtitle="Just added to CineCub"
          icon="fa-star"
          iconBg="transparent"
          iconColor="var(--text-1)"
          items={newReleases}
          type="movie"
          onLoadMore={loadMoreNewReleases}
          hasMore={nrHasMore}
          isLoadingMore={nrLoadingMore}
          viewAll={() => { setBrowseCategory("upcoming"); setActivePage("browse"); }}
        />

        {/* SEO CONTENT & GUIDE SECTION */}
        <div className="seo-section-wrapper">
          <section className="section-wrapper seo-content-section">
            <div className="seo-content-card">
              <div className="seo-badge"><i className="fas fa-play-circle" /> ULTIMATE STREAMING PLATFORM</div>
              <h2 className="seo-title">Watch Free Movies, TV Series &amp; Anime Online on CineCub</h2>
              <p className="seo-intro">
                Welcome to <strong>CineCub</strong>, your premier entertainment hub to <strong>watch free movie online</strong>, <strong>free series online</strong>, and <strong>free anime online</strong> in stunning HD and 4K quality. With a vast library powered by real-time TMDB integration, CineCub gives you instant access to over 1.2 million titles with zero subscription fees, no credit cards, and no signup hurdles.
              </p>
              <div className="seo-features-grid">
                <div className="seo-feature-box">
                  <div className="seo-feature-icon"><i className="fas fa-film" /></div>
                  <h3>Watch Free Movie Online in HD</h3>
                  <p>Explore thousands of full-length films spanning Hollywood blockbusters, indie gems, classic cinema, action thrillers, romantic dramas, and the latest box office hits updated daily.</p>
                </div>
                <div className="seo-feature-box">
                  <div className="seo-feature-icon"><i className="fas fa-tv" /></div>
                  <h3>Binge Free Series Online</h3>
                  <p>Catch up on every season of your favorite TV shows, trending Netflix, HBO, and Prime hits, mini-series, and reality shows with seamless next-episode auto-progression.</p>
                </div>
                <div className="seo-feature-box">
                  <div className="seo-feature-icon"><i className="fas fa-dragon" /></div>
                  <h3>Stream Free Anime Online</h3>
                  <p>Discover top-rated Japanese animation with both English Subbed and English Dubbed options. From shonen blockbusters to slice-of-life classics, stream it all in high definition.</p>
                </div>
                <div className="seo-feature-box">
                  <div className="seo-feature-icon"><i className="fas fa-bolt" /></div>
                  <h3>Ad-Free Native &amp; Multi-Server Streaming</h3>
                  <p>Switch between fast multi-source streaming servers or our dedicated ad-free player. Enjoy cross-device watchlist syncing, resume playback progress, and Android APK &amp; iOS PWA support.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="section-wrapper" style={{ marginTop: "40px" }}>
            <div className="section-header">
              <div className="section-title-group">
                <div className="section-icon" style={{ background: "var(--cv-purple-dim)", color: "var(--cv-purple-light)" }}>
                  <i className="fas fa-question-circle" />
                </div>
                <div>
                  <h2 className="section-title">Frequently Asked Questions</h2>
                  <div className="section-subtitle">Learn more about watching movies and TV series online</div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: "20px", display: "flex", flexDirection: "column" }}>
              {[
                { q: "Is CineCub completely free to watch movies and series online?", a: "Yes! CineCub allows you to watch free movies online, free TV series online, and free anime online with zero subscription fees, no credit cards, and no hidden costs." },
                { q: "Do I need an account or sign up to stream movies and TV shows?", a: "No registration is required to stream. You can instantly watch all movies, full series episodes, and anime titles in guest mode right away. If you wish to sync your watchlist and playback history across devices, you can optionally create a free account in seconds." },
                { q: "What streaming quality and servers are available on CineCub?", a: "CineCub provides High Definition (720p, 1080p, and 4K Ultra HD) video playback across multiple reliable streaming servers, with an optional ad-free native video player for fast, uninterrupted entertainment." },
                { q: "Can I watch English subbed and dubbed anime series for free?", a: "Yes! CineCub features an extensive collection of popular and classic anime with both English subtitles and English dubbed audio tracks, updated with the latest episodes." },
                { q: "Can I install CineCub as an app on Android and iOS devices?", a: "Yes, you can download the native CineCub APK directly for Android phones and tablets, or install the Progressive Web App (PWA) via Safari on Apple iOS." },
              ].map((faq, i) => (
                <details key={i} className="faq-item">
                  <summary className="faq-summary">{faq.q}</summary>
                  <div className="faq-content-wrapper">
                    <div className="faq-content-inner">
                      <div className="faq-content">{faq.a}</div>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
