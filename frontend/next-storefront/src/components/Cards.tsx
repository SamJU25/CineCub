"use client";

import { useState, useRef, useEffect, memo } from "react";
import { IMG, getTrailerSource, prefetchDetail, type TrailerSource } from "@/lib/api";
import { useStore } from "@/lib/store";
import { showToast } from "@/components/Toast";
import type { MediaItem } from "@/lib/types";

function isRecentRelease(date?: string): boolean {
  if (!date) return false;
  const time = new Date(date).getTime();
  if (isNaN(time)) return false;
  return Date.now() - time < 60 * 24 * 60 * 60 * 1000 && time <= Date.now() + 7 * 24 * 60 * 60 * 1000;
}

export const PosterCard = memo(function PosterCard({ item, type }: { item: MediaItem; type?: string }) {
  const openDetail = useStore((s) => s.openDetail);
  const removeFromWatchlist = useStore((s) => s.removeFromWatchlist);
  const addToWatchlist = useStore((s) => s.addToWatchlist);
  const inWl = useStore((s) => s.watchlist.some((w) => w.id === item.id));
  const user = useStore((s) => s.user);
  const openAuth = useStore((s) => s.openAuth);

  const mediaType = type || item.media_type || (item.name && !item.title ? "tv" : "movie");
  const title = item.title || item.name || "Untitled";
  const date = item.release_date || item.first_air_date || "";
  const isNew = isRecentRelease(date);
  const year = date ? date.slice(0, 4) : "";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : "";

  function toggleWl(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inWl) {
      removeFromWatchlist(item.id);
      showToast(`Removed "${title}" from watchlist`, "info");
    } else {
      if (!user) {
        showToast("Please sign in to add to your watchlist", "info");
        openAuth();
        return;
      }
      addToWatchlist({
        id: item.id,
        type: mediaType,
        title,
        poster: item.poster_path,
        vote: item.vote_average || 0,
        date,
        addedAt: Date.now(),
      });
      showToast(`Added "${title}" to watchlist`, "success");
    }
  }

  const badge = isNew ? (
    <span className="pc-badge pc-badge-new">NEW</span>
  ) : mediaType === "tv" ? (
    <span className="pc-badge pc-badge-quality">TV SERIES</span>
  ) : mediaType === "anime" ? (
    <span className="pc-badge pc-badge-quality">ANIME</span>
  ) : (
    <span className="pc-badge pc-badge-quality">HD</span>
  );

  return (
    <a
      href={`/?id=${item.id}&type=${mediaType}`}
      className="poster-card"
      onMouseEnter={() => prefetchDetail(item.id, mediaType)}
      onFocus={() => prefetchDetail(item.id, mediaType)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".pc-wl-btn")) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openDetail(item.id, mediaType);
      }}
      title={`Watch ${title}${year ? ` (${year})` : ""}`}
    >
      <div className="poster-card-img-wrap">
        <img
          className="poster-card-img"
          src={IMG.poster(item.poster_path) || IMG.placeholder()}
          alt={`${title}${year ? ` (${year})` : ""} - Watch on CineCub`}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = IMG.placeholder();
          }}
        />

        <div className="poster-card-grad" />
        <div className="pc-hover-play" aria-hidden="true">
          <i className="fas fa-play" />
        </div>
        <div className="poster-card-top">
          {badge}
          {rating ? (
            <span className="pc-rating">
              <i className="fas fa-star" />
              {rating}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className={`pc-wl-btn${inWl ? " in-list" : ""}`}
          onClick={toggleWl}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={inWl ? "Remove from watchlist" : "Add to watchlist"}
          aria-label={inWl ? "Remove from watchlist" : "Add to watchlist"}
        >
          <i className={inWl ? "fa-solid fa-heart" : "fa-regular fa-heart"} />
        </button>
      </div>
      <div className="poster-card-info">
        <div className="pc-title" title={title}>
          {title}
        </div>
        <div className="pc-meta">{year ? <span>{year}</span> : null}</div>
      </div>
    </a>
  );
});

export const CinematicTrailerCard = memo(function CinematicTrailerCard({ item, type }: { item: MediaItem; type?: string }) {
  const openDetail = useStore((s) => s.openDetail);
  const removeFromWatchlist = useStore((s) => s.removeFromWatchlist);
  const addToWatchlist = useStore((s) => s.addToWatchlist);
  const inWl = useStore((s) => s.watchlist.some((w) => w.id === item.id));
  const user = useStore((s) => s.user);
  const openAuth = useStore((s) => s.openAuth);

  const [trailerSource, setTrailerSource] = useState<TrailerSource | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isTrailerPlayingRef = useRef(false);
  const isLoopingRef = useRef(false);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const mediaType = type || item.media_type || "movie";
  const title = item.title || item.name || "Untitled";
  const date = item.release_date || item.first_air_date || "";
  const year = date ? date.slice(0, 4) : "";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : "";

  function toggleWl(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inWl) {
      removeFromWatchlist(item.id);
      showToast(`Removed "${title}" from watchlist`, "info");
    } else {
      if (!user) {
        showToast("Please sign in to add to your watchlist", "info");
        openAuth();
        return;
      }
      addToWatchlist({
        id: item.id,
        type: mediaType,
        title,
        poster: item.poster_path,
        vote: item.vote_average || 0,
        date,
        addedAt: Date.now(),
      });
      showToast(`Added "${title}" to watchlist`, "success");
    }
  }

  // Fetch trailer on-demand when card is hovered or focused (eliminates 20+ eager blocking requests on page load)
  useEffect(() => {
    if (!isHovered || trailerSource) return;
    let cancelled = false;
    getTrailerSource(item.id, mediaType).then((source) => {
      if (!cancelled && source) {
        setTrailerSource(source);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isHovered, trailerSource, item.id, mediaType]);

  // Autoplay video smoothly when hovered and trailer is ready (matching Spotlight)
  useEffect(() => {
    if (isHovered && trailerSource?.type === "mp4" && videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.defaultMuted = true;
      videoRef.current.playsInline = true;
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [isHovered, trailerSource, isMuted]);

  const handleMouseEnter = () => {
    clearTimeout(hoverTimerRef.current);
    // Micro-debounce (40ms) to ensure smooth cursor movement without delay
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(true);
      if (!trailerSource) {
        getTrailerSource(item.id, mediaType).then((source) => {
          if (source) setTrailerSource(source);
        });
      }
    }, 40);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    setIsHovered(false);
    setIsVideoLoaded(false);
    isTrailerPlayingRef.current = false;
    isLoopingRef.current = false;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    return () => clearTimeout(hoverTimerRef.current);
  }, []);

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

        // 1 = PLAYING: Video is actively running. Reveal smoothly once YouTube's startup pause bezel has faded
        if (playerState === 1) {
          isTrailerPlayingRef.current = true;
          if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
          revealTimerRef.current = setTimeout(() => {
            if (isHovered && isTrailerPlayingRef.current) setIsVideoLoaded(true);
          }, 1000);
        }

        // 2 = PAUSED: Hide immediately so pause button / shadow is never visible
        if (playerState === 2) {
          isTrailerPlayingRef.current = false;
          if (revealTimerRef.current) {
            clearTimeout(revealTimerRef.current);
            revealTimerRef.current = null;
          }
          setIsVideoLoaded(false);
        }

        // 3 = BUFFERING: Don't prematurely reveal if video stalled
        if (playerState === 3 && !isTrailerPlayingRef.current) {
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
  }, [isHovered]);

  const isPlaying = isHovered && Boolean(trailerSource);

  return (
    <a
      href={`/?id=${item.id}&type=${mediaType}`}
      className={`cinematic-trailer-card${isPlaying ? " active" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".ctc-wl-btn")) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openDetail(item.id, mediaType);
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={`Watch ${title}${year ? ` (${year})` : ""}`}
    >
      <div className="ctc-media-wrap">
        {/* Backdrop poster image: Visible by default; smoothly fades out when video plays (matching Spotlight) */}
        <img
          className="ctc-backdrop-img"
          src={IMG.backdrop(item.backdrop_path) || IMG.poster(item.poster_path) || IMG.placeholder(640, 360)}
          alt={`${title}${year ? ` (${year})` : ""} trailer backdrop`}
          loading="lazy"
          decoding="async"
          style={{
            opacity: isPlaying && isVideoLoaded ? 0 : 1,
            transition: "opacity 0.4s ease, transform 0.4s ease",
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = IMG.placeholder(640, 360);
          }}
        />

        {/* Dynamic Cinematic Video Trailer (matching Spotlight & DetailModal) */}
        {isPlaying && trailerSource ? (
          <div className={`ctc-video-container${isVideoLoaded ? " is-loaded" : ""}`}>
            {trailerSource.type === "mp4" ? (
              <video
                ref={videoRef}
                key={trailerSource.src}
                className="ctc-video-el"
                src={trailerSource.src}
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
                key={trailerSource.src}
                className="ctc-video-iframe"
                src={`https://www.youtube-nocookie.com/embed/${trailerSource.src}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&playsinline=1&enablejsapi=1&rel=0&iv_load_policy=3&disablekb=1&modestbranding=1&fs=0&cc_load_policy=0&origin=${encodeURIComponent(typeof window !== "undefined" && window.location.origin && window.location.origin !== "null" ? window.location.origin : "https://cinecub.stream")}`}
                allow="autoplay; encrypted-media"
                tabIndex={-1}
                title="Card Trailer"
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
            {/* Click/touch shield over card trailer */}
            <div className="ctc-video-shield" />
            {isVideoLoaded ? (
              <button
                type="button"
                className="ctc-sound-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextMuted = !isMuted;
                  setIsMuted(nextMuted);
                  if (trailerSource.type === "mp4" && videoRef.current) {
                    videoRef.current.muted = nextMuted;
                  } else if (trailerSource.type === "youtube" && iframeRef.current?.contentWindow) {
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
                }}
                title={isMuted ? "Unmute Trailer" : "Mute Trailer"}
                aria-label={isMuted ? "Unmute Trailer" : "Mute Trailer"}
              >
                <i className={`fas ${isMuted ? "fa-volume-mute" : "fa-volume-up"}`} />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="ctc-top-badges">
          <span className="ctc-badge-trailer">
            TRAILER
          </span>
          {rating ? (
            <span className="ctc-rating">
              <i className="fas fa-star" /> {rating}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className={`ctc-wl-btn${inWl ? " in-list" : ""}`}
          onClick={toggleWl}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={inWl ? "Remove from watchlist" : "Add to watchlist"}
          aria-label={inWl ? "Remove from watchlist" : "Add to watchlist"}
        >
          <i className={inWl ? "fa-solid fa-heart" : "fa-regular fa-heart"} />
        </button>
      </div>
      <div className="ctc-info">
        <div className="ctc-title" title={title}>
          {title}
        </div>
        <div className="ctc-meta">
          <span>{mediaType === "tv" ? "TV Series" : "Movie"}</span>
          {year ? <span>· {year}</span> : null}
        </div>
      </div>
    </a>
  );
});


export const LandscapeCard = memo(function LandscapeCard({ item, type }: { item: MediaItem; type?: string }) {
  const openDetail = useStore((s) => s.openDetail);
  const mediaType = type || item.media_type || (item.name && !item.title ? "tv" : "movie");
  const title = item.title || item.name || "Untitled";
  const date = item.release_date || item.first_air_date || "";
  const year = date ? date.slice(0, 4) : "";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : "";
  const isNew = isRecentRelease(date);

  const badge = isNew ? (
    <span className="pc-badge pc-badge-new">NEW</span>
  ) : (
    <span className="pc-badge pc-badge-quality">{mediaType === "tv" ? "TV SERIES" : "MOVIE"}</span>
  );

  return (
    <a
      href={`/?id=${item.id}&type=${mediaType}`}
      className="landscape-card"
      onMouseEnter={() => prefetchDetail(item.id, mediaType)}
      onFocus={() => prefetchDetail(item.id, mediaType)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openDetail(item.id, mediaType);
      }}
      title={`Watch ${title}${year ? ` (${year})` : ""}`}
    >
      <div className="lc-img-wrap">
        <img
          className="lc-img"
          src={IMG.backdrop(item.backdrop_path) || IMG.placeholder(640, 360)}
          alt={`${title}${year ? ` (${year})` : ""} backdrop`}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = IMG.placeholder(640, 360);
          }}
        />
        <div className="lc-overlay" />
        <div className="lc-top">
          {badge}
          {rating ? (
            <span className="pc-rating">
              <i className="fas fa-star" />
              {rating}
            </span>
          ) : null}
        </div>
      </div>
      <div className="lc-info">
        <div className="lc-title">{title}</div>
        <div className="lc-meta">{year ? <span>{year}</span> : null}</div>
      </div>
    </a>
  );
});

export const Top10Card = memo(function Top10Card({ item, rank }: { item: MediaItem; rank: number }) {
  const openDetail = useStore((s) => s.openDetail);
  const removeFromWatchlist = useStore((s) => s.removeFromWatchlist);
  const addToWatchlist = useStore((s) => s.addToWatchlist);
  const inWl = useStore((s) => s.watchlist.some((w) => w.id === item.id));
  const user = useStore((s) => s.user);
  const openAuth = useStore((s) => s.openAuth);

  const mediaType = item.media_type || (item.name && !item.title ? "tv" : "movie");
  const title = item.title || item.name || "Untitled";
  const date = item.release_date || item.first_air_date || "";
  const year = date ? date.slice(0, 4) : "";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : "";

  function toggleWl(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inWl) {
      removeFromWatchlist(item.id);
      showToast(`Removed "${title}" from watchlist`, "info");
    } else {
      if (!user) {
        showToast("Please sign in to add to your watchlist", "info");
        openAuth();
        return;
      }
      addToWatchlist({
        id: item.id,
        type: mediaType,
        title,
        poster: item.poster_path,
        vote: item.vote_average || 0,
        date,
        addedAt: Date.now(),
      });
      showToast(`Added "${title}" to watchlist`, "success");
    }
  }

  const rankBadge =
    rank === 1 ? (
      <span className="top10-rank-pill rank-1">
        <i className="fas fa-crown" /> #1
      </span>
    ) : rank === 2 ? (
      <span className="top10-rank-pill rank-2">
        <i className="fas fa-medal" /> #2
      </span>
    ) : rank === 3 ? (
      <span className="top10-rank-pill rank-3">
        <i className="fas fa-award" /> #3
      </span>
    ) : (
      <span className="top10-rank-pill rank-default">
        #{rank}
      </span>
    );

  return (
    <a
      href={`/?id=${item.id}&type=${mediaType}`}
      className={`poster-card top10-poster-card top10-podium-${rank}`}
      onMouseEnter={() => prefetchDetail(item.id, mediaType)}
      onFocus={() => prefetchDetail(item.id, mediaType)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".pc-wl-btn")) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openDetail(item.id, mediaType);
      }}
      title={`#${rank} in Top 10 Today: ${title}${year ? ` (${year})` : ""}`}
    >
      <div className="poster-card-img-wrap">
        <img
          className="poster-card-img"
          src={IMG.poster(item.poster_path) || IMG.placeholder()}
          alt={`${title}${year ? ` (${year})` : ""} - #${rank} on CineCub`}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = IMG.placeholder();
          }}
        />
        <div className="poster-card-grad" />
        <div className="pc-hover-play" aria-hidden="true">
          <i className="fas fa-play" />
        </div>

        <div className="poster-card-top">
          {rankBadge}
          {rating && rating !== "N/A" ? (
            <span className="pc-rating">
              <i className="fas fa-star" />
              {rating}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          className={`pc-wl-btn${inWl ? " in-list" : ""}`}
          onClick={toggleWl}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={inWl ? "Remove from watchlist" : "Add to watchlist"}
          aria-label={inWl ? "Remove from watchlist" : "Add to watchlist"}
        >
          <i className={inWl ? "fa-solid fa-heart" : "fa-regular fa-heart"} />
        </button>
      </div>

      <div className="poster-card-info">
        <div className="pc-title" title={title}>
          {title}
        </div>
        <div className="pc-meta">
          {year ? <span>{year}</span> : null}
          <span className="pc-genre">{mediaType === "tv" ? "TV Series" : "Movie"}</span>
        </div>
      </div>
    </a>
  );
});

export const CompactCard = Top10Card;

interface CWCardItem {
  id: number;
  type?: string;
  media_type?: string;
  title?: string;
  name?: string;
  poster?: string | null;
  poster_path?: string | null;
  progress?: number;
  pct?: number;
  season?: number;
  episode?: number;
}

export const ContinueWatchingCard = memo(function ContinueWatchingCard({ item }: { item: CWCardItem }) {
  const openDetail = useStore((s) => s.openDetail);
  const openPlayer = useStore((s) => s.openPlayer);
  const progress = item.progress || 0;
  const mediaType = item.type || item.media_type || "movie";
  const title = item.title || item.name || "Untitled";
  const s = item.season;
  const ep = item.episode;
  const epLabel = mediaType === "tv" && s && ep ? `S${s} E${ep}` : mediaType === "tv" ? "TV SERIES" : "MOVIE";
  const hasProgress = progress > 0;
  const metaText = hasProgress
    ? `${Math.round(progress)}% watched`
    : mediaType === "tv" && s && ep
    ? `Resume S${s} E${ep}`
    : "Recently Watched";

  const posterPath = item.poster || item.poster_path || null;

  return (
    <div
      className="poster-card cw-card"
      onMouseEnter={() => prefetchDetail(item.id, mediaType)}
      onClick={() => openPlayer(item.id, mediaType, title, s, ep, posterPath ?? undefined)}
      role="button"
      tabIndex={0}
      title={`Resume ${title}`}
    >
      <div className="poster-card-img-wrap">
        <img
          className="poster-card-img"
          src={IMG.poster(posterPath) || IMG.placeholder()}
          alt={title}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.target as HTMLImageElement).src = IMG.placeholder();
          }}
        />
        <div className="poster-card-grad" />
        {hasProgress ? (
          <div className="cw-progress-overlay">
            <div className="cw-progress-bar">
              <div className="cw-progress-fill" style={{ width: `${Math.min(Math.max(0, progress), 100)}%` }} />
            </div>
          </div>
        ) : null}
        <div
          className="pc-play-wrap"
          onClick={(evt) => {
            evt.stopPropagation();
            openPlayer(item.id, mediaType, title, s, ep, posterPath ?? undefined);
          }}
        >
          <div className="pc-play-btn">
            <i className="fas fa-play" />
          </div>
        </div>
        <div className="poster-card-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "6px 8px" }}>
          <span className="pc-badge pc-badge-quality" style={{ background: "rgba(0,0,0,0.75)" }}>
            {epLabel}
          </span>
          <button
            type="button"
            className="pc-info-btn"
            title="View Details"
            onClick={(e) => {
              e.stopPropagation();
              openDetail(item.id, mediaType);
            }}
            style={{
              background: "rgba(0,0,0,0.65)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              borderRadius: "50%",
              width: "26px",
              height: "26px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: "11px",
              backdropFilter: "blur(4px)",
            }}
          >
            <i className="fas fa-info" />
          </button>
        </div>
      </div>
      <div
        className="poster-card-info"
        style={{
          opacity: 1,
          transform: "none",
          background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, transparent 100%)",
        }}
      >
        <div className="pc-title">{title}</div>
        <div className="pc-meta">
          <span style={{ color: "var(--cv-purple-light)", fontWeight: 700 }}>{metaText}</span>
        </div>
      </div>
    </div>
  );
});

export function SkeletonCard() {
  return <div className="skel-poster" />;
}
