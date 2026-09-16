"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";
import { IMG, getDetail } from "@/lib/api";
import type { MediaDetail, HistoryItem } from "@/lib/types";

/* 60-day cutoff computed once at module level — avoids impure Date.now() in render */
const NEW_CUTOFF = Date.now() - 60 * 24 * 60 * 60 * 1000;

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

function getLiveProgress(
  id: number,
  type: string,
  season?: number,
  episode?: number,
  fallbackProgress?: number,
  progressMap?: Record<string, { progress?: number }>
): number {
  if (fallbackProgress != null && fallbackProgress > 0) return fallbackProgress;
  const progress = progressMap || useStore.getState().progress;
  const isTv = type === "tv";
  const key = isTv ? `${id}_s${season || 1}e${episode || 1}` : String(id);
  const entry = progress[key];
  if (entry?.progress) return entry.progress;
  for (const k in progress) {
    if (k === String(id) || k.startsWith(`${id}_`)) {
      if (progress[k]?.progress) return progress[k].progress;
    }
  }
  return 0;
}

export default function HistoryPage() {
  const { history, clearHistory, setActivePage, openDetail, openPlayer } = useStore((s) => s);
  const progress = useStore((s) => s.progress);
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const missing = history.filter((item) => !item.poster && !item.poster_path);
    if (missing.length === 0) return;
    let cancelled = false;
    const patches = new Map<number, { poster: string; title?: string | null }>();

    let cache: Record<string, { poster?: string; title?: string }> = {};
    if (typeof localStorage !== "undefined") {
      try {
        cache = (JSON.parse(localStorage.getItem("sh_progress_store") || "{}") as Record<string, { poster?: string; title?: string }>) || {};
      } catch {
        cache = {};
      }
    }
    for (const item of missing) {
      for (const k in cache) {
        if (k === String(item.id) || k.startsWith(`${item.id}_`)) {
          const v = cache[k];
          if (v?.poster) {
            patches.set(item.id, { poster: v.poster, title: v.title });
            break;
          }
        }
      }
    }

    const needFetch = missing.filter((item) => !patches.has(item.id));
    if (needFetch.length === 0) {
      const updated = history.map((h) => {
        const p = patches.get(h.id);
        if (!p || (h.poster || h.poster_path)) return h;
        const hasRealTitle = h.title && h.title !== "Series" && h.title !== "Movie" && !h.title.startsWith("Untitled");
        return { ...h, poster: p.poster, poster_path: p.poster, title: !hasRealTitle && p.title ? p.title : h.title };
      });
      try {
        localStorage.setItem("sh_history", JSON.stringify(updated));
      } catch {
        /* storage full/unavailable — keep in-memory only */
      }
      useStore.setState({ history: updated as HistoryItem[] });
      return;
    }

    const MAX_FETCHES = 30;
    const results = new Map<number, { poster: string; title?: string | null }>();
    let next = 0;
    let settled = 0;

    const fetchOne = async () => {
      while (next < needFetch.length && settled < MAX_FETCHES) {
        const item = needFetch[next++];
        settled++;
        try {
          const d = await getDetail<MediaDetail>(item.id, item.type || item.media_type || "movie");
          if (cancelled) return;
          if (d?.poster_path) {
            results.set(item.id, { poster: d.poster_path, title: d.title || d.name });
          }
        } catch {
          /* network hiccup — skip, retried next visit */
        }
      }
      if (cancelled || results.size === 0) return;
      const updated = history.map((h) => {
        const p = results.get(h.id);
        if (!p || (h.poster || h.poster_path)) return h;
        const hasRealTitle = h.title && h.title !== "Series" && h.title !== "Movie" && !h.title.startsWith("Untitled");
        return { ...h, poster: p.poster, poster_path: p.poster, title: !hasRealTitle && p.title ? p.title : h.title };
      });
      try {
        localStorage.setItem("sh_history", JSON.stringify(updated));
      } catch {
        /* storage full/unavailable — keep in-memory only */
      }
      useStore.setState({ history: updated as HistoryItem[] });
    };

    const CONCURRENCY = 6;
    const workers = Array.from({ length: CONCURRENCY }, () => fetchOne());
    void Promise.all(workers);

    return () => {
      cancelled = true;
    };
  }, [history]);

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear your entire watch history? This cannot be undone.")) {
      clearHistory();
    }
  };

  return (
    <div className="page-inner">
      <div className="cv-container">
        <div className="browse-header" style={{ marginBottom: "20px" }}>
          <div className="browse-title-group">
            <div className="browse-breadcrumbs">CineCub &rsaquo; <span>Watch History</span></div>
            <div className="section-header-kicker">ACTIVITY LOG</div>
            <h1 className="section-title" style={{ margin: 0, fontSize: "26px", fontWeight: 900 }}>Watch History</h1>
          </div>
          {mounted && history.length > 0 && (
            <button
              onClick={handleClearHistory}
              style={{
                background: "rgba(230, 57, 70, 0.12)",
                color: "#e63946",
                border: "1px solid rgba(230, 57, 70, 0.3)",
                borderRadius: "var(--r-pill)",
                padding: "10px 20px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexShrink: 0,
                transition: "background 0.2s, border-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(230, 57, 70, 0.25)";
                e.currentTarget.style.borderColor = "rgba(230, 57, 70, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(230, 57, 70, 0.12)";
                e.currentTarget.style.borderColor = "rgba(230, 57, 70, 0.3)";
              }}
            >
              <i className="fas fa-trash-alt" />
              Clear History
            </button>
          )}
        </div>

        <div className="poster-grid" id="history-grid">
          {!mounted || history.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 0" }}>
              <i className="fas fa-history" style={{ fontSize: "48px", color: "var(--text-4)", marginBottom: "16px", display: "block" }} />
              <p style={{ color: "var(--text-3)", fontSize: "14px", marginBottom: "16px" }}>No watch history yet</p>
              <button onClick={() => setActivePage("home")} style={{ background: "var(--cv-purple)", color: "#fff", padding: "10px 20px", borderRadius: "var(--r-md)", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>
                Browse Content
              </button>
            </div>
          ) : history.map((item, i) => {
            const mediaType = item.type || item.media_type || "movie";
            const date = item.date || item.release_date || item.first_air_date || "";
            const isNew = Boolean(date && new Date(date).getTime() > NEW_CUTOFF);
            const badge = isNew ? (
              <span className="pc-badge pc-badge-new">NEW</span>
            ) : mediaType === "tv" ? (
              <span className="pc-badge pc-badge-quality">TV SERIES</span>
            ) : mediaType === "anime" ? (
              <span className="pc-badge pc-badge-quality">ANIME</span>
            ) : (
              <span className="pc-badge pc-badge-quality">HD</span>
            );
            const rawVote = item.vote ?? item.vote_average ?? 0;
            const rating = rawVote > 0 ? rawVote.toFixed(1) : "";
            const posterSrc = IMG.poster(item.poster || item.poster_path, "w342") || IMG.placeholder();
            const liveProg = getLiveProgress(item.id, mediaType, item.season, item.episode, item.progress, progress);

            return (
              <div key={`${item.id}-${i}`} className="poster-card" onClick={() => openDetail(item.id, mediaType)}>
                <div className="poster-card-img-wrap">
                  <img
                    className="poster-card-img"
                    src={posterSrc}
                    alt={item.title || item.name || ""}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = IMG.placeholder(); }}
                  />
                  <div className="poster-card-grad" />
                  <div className="poster-card-top">
                    {badge}
                    {rating ? (
                      <span className="pc-rating">
                        <i className="fas fa-star" />{rating}
                      </span>
                    ) : null}
                  </div>
                  {liveProg > 0 && (
                    <div className="cw-progress-overlay">
                      <div className="cw-progress-bar">
                        <div
                          className="cw-progress-fill"
                          style={{ width: `${Math.min(liveProg, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div
                    className="pc-play-wrap"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPlayer(item.id, mediaType, item.title || item.name || "Untitled", item.season, item.episode, (item.poster || item.poster_path) ?? undefined);
                    }}
                  >
                    <div className="pc-play-btn"><i className="fas fa-play" /></div>
                  </div>
                </div>
                <div className="poster-card-info">
                  <div className="pc-title">{item.title || item.name}</div>
                  <div className="pc-meta">
                    <span>{date.slice(0, 4)}</span>
                    {item.season != null && item.episode != null ? (
                      <span className="pc-genre">S{item.season} E{item.episode}</span>
                    ) : (
                      <span className="pc-genre">{mediaType === "tv" ? "TV Series" : "Movie"}</span>
                    )}
                    {liveProg > 0 ? (
                      <span style={{ color: "var(--cv-purple-light)", fontWeight: 700 }}>{liveProg}%</span>
                    ) : rating ? (
                      <span>★ {rating}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
