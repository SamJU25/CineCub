"use client";

import { useState, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { IMG } from "@/lib/api";
import { showToast } from "@/components/Toast";
import { ConfirmModal } from "@/components/Modals";

/* 60-day cutoff computed once at module level — avoids impure Date.now() in render */
const NEW_CUTOFF = Date.now() - 60 * 24 * 60 * 60 * 1000;

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function WatchlistPage() {
  const { watchlist, removeFromWatchlist, clearWatchlist, setActivePage, openDetail, user, openAuth } = useStore(
    useShallow((s) => ({
      watchlist: s.watchlist,
      removeFromWatchlist: s.removeFromWatchlist,
      clearWatchlist: s.clearWatchlist,
      setActivePage: s.setActivePage,
      openDetail: s.openDetail,
      user: s.user,
      openAuth: s.openAuth,
    }))
  );
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  return (
    <div className="page-inner">
      <div className="cv-container">
        <div className="browse-header" style={{ marginBottom: "20px" }}>
          <div className="browse-title-group">
            <div className="browse-breadcrumbs">CineCub &rsaquo; <span>My Watchlist</span></div>
            <div className="section-header-kicker">SAVED TITLES</div>
            <h1 className="section-title" style={{ margin: 0, fontSize: "26px", fontWeight: 900 }}>My Watchlist</h1>
          </div>
          {mounted && user && watchlist.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
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
              Clear Watchlist
            </button>
          )}
        </div>

        <div className="poster-grid" id="wl-grid">
          {!mounted ? null : !user ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 0" }}>
              <i className="fa-regular fa-heart" style={{ fontSize: "48px", color: "var(--text-4)", marginBottom: "16px", display: "block" }} />
              <h3 style={{ color: "#fff", fontSize: "18px", fontWeight: 800, marginBottom: "8px" }}>Sign In to View Your Watchlist</h3>
              <p style={{ color: "var(--text-3)", fontSize: "14px", marginBottom: "20px" }}>Save movies, series, and anime to your personal list and sync them across all your devices.</p>
              <button onClick={() => openAuth()} style={{ background: "linear-gradient(135deg, var(--cv-purple), #7928ca)", color: "#fff", padding: "10px 24px", borderRadius: "var(--r-md)", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "14px", boxShadow: "0 4px 14px rgba(157, 78, 221, 0.4)" }}>
                Sign In / Register
              </button>
            </div>
          ) : watchlist.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 0" }}>
              <i className="fa-regular fa-heart" style={{ fontSize: "48px", color: "var(--text-4)", marginBottom: "16px", display: "block" }} />
              <p style={{ color: "var(--text-3)", fontSize: "14px", marginBottom: "16px" }}>Your watchlist is empty</p>
              <button onClick={() => setActivePage("home")} style={{ background: "var(--cv-purple)", color: "#fff", padding: "10px 20px", borderRadius: "var(--r-md)", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>
                Browse Content
              </button>
            </div>
          ) : watchlist.map((item) => {
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

            return (
              <div
                key={`${item.id}-${item.type}`}
                className="poster-card"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest(".pc-wl-btn")) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  openDetail(item.id, mediaType);
                }}
              >
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
                  <button
                    type="button"
                    className="pc-wl-btn in-list"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeFromWatchlist(item.id);
                      showToast(`Removed "${item.title || item.name}" from watchlist`, "info");
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Remove from watchlist"
                    aria-label="Remove from watchlist"
                  >
                    <i className="fa-solid fa-heart" />
                  </button>
                </div>
                <div className="poster-card-info">
                  <div className="pc-title">{item.title || item.name}</div>
                  <div className="pc-meta">
                    <span>{date.slice(0, 4)}</span>
                    <span className="pc-genre">{mediaType === "tv" ? "TV Series" : "Movie"}</span>
                    {rating ? <span>★ {rating}</span> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {showClearConfirm && (
        <ConfirmModal
          title="Clear Watchlist"
          text="Are you sure you want to clear your entire watchlist? This cannot be undone."
          onConfirm={() => {
            clearWatchlist();
            setShowClearConfirm(false);
            showToast("Watchlist cleared", "info");
          }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}
