"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { getDetail, getSeasonEpisodes, IMG, year, runtime, genreNames, formatRating, getTrailerSource, type TrailerSource } from "@/lib/api";
import type { MediaDetail, CastMember, CrewMember, Video, Episode, Season, MediaItem } from "@/lib/types";
import HScrollWrapper from "@/components/HScrollWrapper";
import CustomSelect from "@/components/CustomSelect";
import { showToast } from "@/components/Toast";
import { BrandLogo } from "@/components/BrandLogo";
import CinemaStageCanvas from "@/components/CinemaStageCanvas";

interface PersonDetail {
  id: number;
  name: string;
  profile_path?: string;
  biography?: string;
  birthday?: string;
  deathday?: string | null;
  place_of_birth?: string;
  gender?: number;
  known_for_department?: string;
  also_known_as?: string[];
  external_ids?: { twitter_id?: string; instagram_id?: string; facebook_id?: string; imdb_id?: string };
  combined_credits?: { cast?: (MediaItem & { character?: string })[]; crew?: CrewMember[] };
}

/* 60-day cutoff computed once at module level — avoids impure Date.now() in render */
const NEW_CUTOFF = Date.now() - 60 * 86400000;

function formatPersonBirthday(birthday: string, deathday?: string | null): string {
  try {
    const bDate = new Date(birthday);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const formatted = `${monthNames[bDate.getUTCMonth()]} ${bDate.getUTCDate()}, ${bDate.getUTCFullYear()}`;
    if (deathday) {
      const dDate = new Date(deathday);
      let age = dDate.getUTCFullYear() - bDate.getUTCFullYear();
      const m = dDate.getUTCMonth() - bDate.getUTCMonth();
      if (m < 0 || (m === 0 && dDate.getUTCDate() < bDate.getUTCDate())) age--;
      return `${formatted} (Died: ${deathday}, aged ${age})`;
    } else {
      const today = new Date();
      let age = today.getFullYear() - bDate.getUTCFullYear();
      const m = today.getMonth() - bDate.getUTCMonth();
      if (m < 0 || (m === 0 && today.getDate() < bDate.getUTCDate())) age--;
      return `${formatted} (${age} years old)`;
    }
  } catch {
    return birthday;
  }
}

export default function DetailModal() {
  const {
    detailModal,
    closeDetail,
    openPlayer,
    openTrailer,
    openDetail,
    watchlist,
    isInWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    addToHistory,
    setActivePage,
    setBrowseCategory,
    user,
    openAuth,
  } = useStore((s) => s);
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const trailerVideoRef = useRef<HTMLVideoElement>(null);
  const trailerIframeRef = useRef<HTMLIFrameElement>(null);
  const isTrailerPlayingRef = useRef(false);
  const isLoopingRef = useRef(false);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [personDetail, setPersonDetail] = useState<PersonDetail | null>(null);
  const trailerAbortRef = useRef<AbortController | null>(null);
  const [trailerSource, setTrailerSource] = useState<TrailerSource | null>(null);

  const [navHistory, setNavHistory] = useState<{ id: number; type: string }[]>([]);
  const [isScrolled, setIsScrolled] = useState(false);
  const prevModalRef = useRef<{ id: number; type: string } | null>(null);


  const [retryCount, setRetryCount] = useState(0);

  // Reset history stack if modal was freshly opened from closed state
  useEffect(() => {
    if (!detailModal) {
      setDetail(null);
      setPersonDetail(null);
      setNavHistory([]);
      prevModalRef.current = null;
      return;
    }
    if (!prevModalRef.current) {
      setNavHistory([]);
    }
    prevModalRef.current = { id: detailModal.id, type: detailModal.type };
  }, [detailModal]);

  // Navigate to an item pushing current item onto history stack
  const navigateTo = useCallback((id: number, type: string) => {
    if (detailModal && (detailModal.id !== id || detailModal.type !== type)) {
      setNavHistory((prev) => [...prev, { id: detailModal.id, type: detailModal.type }]);
    }
    openDetail(id, type);
  }, [detailModal, openDetail]);

  // Back button pops from history stack or closes
  const handleBack = useCallback(() => {
    if (navHistory.length > 0) {
      const prev = navHistory[navHistory.length - 1];
      setNavHistory((stack) => stack.slice(0, -1));
      openDetail(prev.id, prev.type);
    } else {
      closeDetail();
    }
  }, [navHistory, closeDetail, openDetail]);

  function renderPosterCardItem(
    item: MediaItem,
    width: string,
    fallbackType?: string,
    customSubtitle?: string
  ) {
    const itemDate = item.release_date || item.first_air_date || "";
    const itemMediaType = item.media_type || (item.title ? "movie" : "tv") || fallbackType || "movie";
    const itemTitle = item.title || item.name || "Untitled";
    const isNew = Boolean(itemDate && new Date(itemDate).getTime() > NEW_CUTOFF);
    const rawVote = item.vote_average ? Number(item.vote_average) : 0;
    const rating = rawVote > 0 ? rawVote.toFixed(1) : "";
    const itemYear = itemDate ? itemDate.slice(0, 4) : "";
    const inWl = isInWatchlist(item.id);

    const badge = isNew ? (
      <span className="pc-badge pc-badge-new">NEW</span>
    ) : itemMediaType === "tv" ? (
      <span className="pc-badge pc-badge-quality">TV SERIES</span>
    ) : itemMediaType === "anime" ? (
      <span className="pc-badge pc-badge-quality">ANIME</span>
    ) : (
      <span className="pc-badge pc-badge-quality">HD</span>
    );

    return (
      <div
        key={`${item.id}-${customSubtitle || itemTitle}`}
        className="poster-card"
        style={{ width, flexShrink: 0, cursor: "pointer" }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest(".pc-wl-btn")) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          navigateTo(item.id, itemMediaType);
        }}
      >
        <div className="poster-card-img-wrap">
          <img
            className="poster-card-img"
            src={IMG.poster(item.poster_path, "w342") || IMG.placeholder()}
            alt={itemTitle}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = IMG.placeholder();
            }}
          />
          <div className="poster-card-grad" />
          <div className="poster-card-top">
            {badge}
            {rating && rating !== "0.0" ? (
              <span className="pc-rating">
                <i className="fas fa-star" />{rating}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className={`pc-wl-btn${inWl ? " in-list" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (inWl) {
                removeFromWatchlist(item.id);
                showToast(`Removed "${itemTitle}" from watchlist`, "info");
              } else {
                if (!user) {
                  showToast("Please sign in to add to your watchlist", "info");
                  openAuth();
                  return;
                }
                addToWatchlist({
                  id: item.id,
                  type: itemMediaType,
                  title: itemTitle,
                  poster: item.poster_path,
                  vote: rawVote,
                  date: itemDate,
                  addedAt: Date.now(),
                });
                showToast(`Added "${itemTitle}" to watchlist`, "success");
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            title={inWl ? "Remove from watchlist" : "Add to watchlist"}
            aria-label={inWl ? "Remove from watchlist" : "Add to watchlist"}
          >
            <i className={inWl ? "fa-solid fa-heart" : "fa-regular fa-heart"} />
          </button>
        </div>
        <div className="poster-card-info">
          <div className="pc-title" title={itemTitle}>{itemTitle}</div>
          <div className="pc-meta">
            <span>{customSubtitle || itemYear}</span>
          </div>
        </div>
      </div>
    );
  }

  // Reset scroll position on navigation
  useEffect(() => {
    const modalEl = document.getElementById("fv-modal");
    if (modalEl) modalEl.scrollTop = 0;
    setIsScrolled(false);
  }, [detailModal?.id, detailModal?.type]);

  // Load data for movie/tv or person
  useEffect(() => {
    if (!detailModal) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (detailModal!.type === "person") {
        setDetail(null);
        try {
          const data = await getDetail<PersonDetail>(detailModal!.id, "person");
          if (!cancelled) {
            setPersonDetail(data);
            setLoading(false);
          }
        } catch {
          if (!cancelled) setLoading(false);
        }
      } else {
        setPersonDetail(null);
        try {
          const data = await getDetail(detailModal!.id, detailModal!.type);
          if (!cancelled) {
            setDetail(data);
            setLoading(false);
            if (data) {
              // Auto-correct media type if TMDB returned a TV series for a movie request
              const isActuallyTv = Boolean(
                data.number_of_seasons ||
                (data.seasons && data.seasons.length > 0) ||
                data.first_air_date ||
                (data.name && !data.title)
              );
              if (isActuallyTv && detailModal!.type === "movie") {
                openDetail(detailModal!.id, "tv");
              }
            }
            if (data?.seasons?.length) {
              let savedSeason: number | null = null;
              try {
                const store = JSON.parse(localStorage.getItem("sh_progress_store") || "{}");
                let maxTime = 0;
                for (const [k, v] of Object.entries(store) as [string, { updatedAt?: number; season?: number }][]) {
                  if (k.startsWith(`${detailModal!.id}_s`)) {
                    const t = v?.updatedAt || 0;
                    if (t > maxTime && v?.season) {
                      maxTime = t;
                      savedSeason = v.season;
                    }
                  }
                }
              } catch {}
              if (savedSeason && data.seasons.some((s: Season) => s.season_number === savedSeason)) {
                setSelectedSeason(savedSeason);
              } else {
                const firstSeason = data.seasons.find((s: Season) => s.season_number > 0) || data.seasons[0];
                setSelectedSeason(firstSeason.season_number);
              }
            }
          }
        } catch {
          if (!cancelled) setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [detailModal, retryCount, openDetail]);

  // Background trailer playback for movie/tv (Native MP4 or Chromeless YouTube Embed)
  useEffect(() => {
    if (!detail || detailModal?.type === "person") {
      setTrailerSource(null);
      return;
    }
    if (trailerAbortRef.current) { try { trailerAbortRef.current.abort(); } catch {} }
    const controller = new AbortController();
    trailerAbortRef.current = controller;

    const heroWrap = document.getElementById("fv-hero-video-wrap") as HTMLElement | null;
    const backdropEl = document.getElementById("fv-backdrop") as HTMLElement | null;
    if (heroWrap) {
      heroWrap.classList.remove("is-loaded");
      heroWrap.style.opacity = "0";
    }
    if (backdropEl) {
      backdropEl.style.opacity = "1";
    }

    const id = detail.id;
    const isTv = detailModal?.type === "tv" || detailModal?.type === "anime";
    const trailerType = isTv ? "tv" : "movie";

    // 1. Immediately check if detail already includes YouTube trailer keys (fastest zero-delay playback)
    const ytVideos = detail.videos?.results?.filter((v) => v.site === "YouTube" && v.key) || [];
    const ytTrailer =
      ytVideos.find((v) => v.type === "Trailer" && v.official) ||
      ytVideos.find((v) => v.type === "Trailer") ||
      ytVideos.find((v) => v.type === "Teaser") ||
      ytVideos[0];

    if (ytTrailer?.key) {
      setTrailerSource({ type: "youtube", src: ytTrailer.key });
    }

    // 2. Query getTrailerSource for native MP4 if available or fallback
    getTrailerSource(id, trailerType)
      .then((source) => {
        if (controller.signal.aborted || !source) return;
        setTrailerSource(source);
      })
      .catch(() => {});

    return () => {
      if (trailerAbortRef.current === controller) trailerAbortRef.current = null;
      try { controller.abort(); } catch {}
      setTrailerSource(null);
      if (heroWrap) {
        heroWrap.classList.remove("is-loaded");
        heroWrap.style.opacity = "0";
      }
      if (backdropEl) {
        backdropEl.style.opacity = "1";
      }
    };
  }, [detail, detailModal?.type]);

  // Seamless auto-loop and auto-resume for YouTube iframe (eliminates pause button and transport HUD)
  useEffect(() => {
    isTrailerPlayingRef.current = false;
    isLoopingRef.current = false;
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    const handleResume = () => {
      if (trailerVideoRef.current && trailerVideoRef.current.paused) {
        trailerVideoRef.current.play().catch(() => {});
      }
    };
    const handleVis = () => {
      if (!document.hidden) handleResume();
    };
    window.addEventListener("pointerdown", handleResume, { passive: true });
    window.addEventListener("keydown", handleResume, { passive: true });
    document.addEventListener("visibilitychange", handleVis);

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
            trailerIframeRef.current?.contentWindow?.postMessage(
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
            if (isTrailerPlayingRef.current) {
              const heroWrap = document.getElementById("fv-hero-video-wrap");
              const backdropEl = document.getElementById("fv-backdrop");
              if (heroWrap) {
                heroWrap.classList.add("is-loaded");
                heroWrap.style.opacity = "1";
              }
              if (backdropEl) backdropEl.style.opacity = "0";
            }
          }, 1100);
        }

        // 2 = PAUSED: Hide immediately so pause button / shadow is never visible
        if (playerState === 2) {
          isTrailerPlayingRef.current = false;
          if (revealTimerRef.current) {
            clearTimeout(revealTimerRef.current);
            revealTimerRef.current = null;
          }
          const heroWrap = document.getElementById("fv-hero-video-wrap");
          const backdropEl = document.getElementById("fv-backdrop");
          if (heroWrap) {
            heroWrap.classList.remove("is-loaded");
            heroWrap.style.opacity = "0";
          }
          if (backdropEl) backdropEl.style.opacity = "1";
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
          trailerIframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: "seekTo", args: [0, true] }),
            "*"
          );
        }
      } catch {}
    };
    window.addEventListener("message", handleMsg);

    return () => {
      window.removeEventListener("pointerdown", handleResume);
      window.removeEventListener("keydown", handleResume);
      document.removeEventListener("visibilitychange", handleVis);
      window.removeEventListener("message", handleMsg);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  // Load TV season episodes
  useEffect(() => {
    const isTv =
      detailModal?.type === "tv" ||
      detailModal?.type === "anime" ||
      Boolean(detail?.number_of_seasons) ||
      Boolean(detail?.seasons && detail.seasons.length > 0);
    if (!detail || !isTv || selectedSeason < 0) return;
    let cancelled = false;
    async function load() {
      setLoadingEpisodes(true);
      const data = await getSeasonEpisodes(detail!.id, selectedSeason);
      if (!cancelled) setEpisodes(data?.episodes || []);
      setLoadingEpisodes(false);
    }
    load();
    return () => { cancelled = true; };
  }, [detail, selectedSeason, detailModal?.type]);

  // Escape key handler
  useEffect(() => {
    if (!detailModal) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleBack();
      }
    };
    document.addEventListener("keydown", handleKey);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.classList.remove("modal-open");
    };
  }, [detailModal, handleBack]);

  if (!detailModal) return null;

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) closeDetail();
  }

  const isPerson = detailModal.type === "person";
  const d = detail;
  const isActuallyTv = Boolean(
    d?.number_of_seasons ||
    (d?.seasons && d.seasons.length > 0) ||
    d?.first_air_date ||
    (d?.name && !d?.title)
  );
  const type = detailModal.type === "person" ? "person" : (detailModal.type === "anime" ? "anime" : (isActuallyTv ? "tv" : detailModal.type));
  const title = isPerson ? (personDetail?.name || "") : (d?.title || d?.name || "");
  const date = d?.release_date || d?.first_air_date || "";
  const inWl = d ? watchlist.some((w) => w.id === d.id) : false;
  const trailer = d?.videos?.results?.find((v: Video) => v.site === "YouTube" && v.type === "Trailer") || d?.videos?.results?.find((v: Video) => v.site === "YouTube");
  const cast = d?.credits?.cast?.slice(0, 18) || [];
  const similar = d?.similar?.results?.slice(0, 12) || d?.recommendations?.results?.slice(0, 12) || [];
  const director = d?.credits?.crew?.find((c: CrewMember) => c.job === "Director");
  const studioName = d?.production_companies?.length ? d.production_companies[0].name : "CINECUB CINEMA";
  const rating = d?.content_ratings?.results?.find((r: { iso_3166_1: string; rating: string }) => r.iso_3166_1 === "US")?.rating || d?.release_dates?.results?.find((r: { iso_3166_1: string; release_dates?: { certification?: string }[] }) => r.iso_3166_1 === "US")?.release_dates?.[0]?.certification;
  const seasonOptions = (d?.seasons || [])
    .filter((s: Season) => s && typeof s.season_number === "number" && s.season_number >= 0)
    .map((s: Season) => ({
      value: String(s.season_number),
      label: s.season_number === 0 ? (s.name || "Specials") : (s.name || `Season ${s.season_number}`),
    }));

  function toggleWl() {
    if (!d) return;
    if (inWl) {
      removeFromWatchlist(d.id);
      showToast(`Removed "${title}" from watchlist`);
    } else {
      if (!user) {
        showToast("Please sign in to add to your watchlist");
        openAuth();
        return;
      }
      addToWatchlist({ id: d.id, type, title, poster: d.poster_path, vote: d.vote_average || 0, date, addedAt: Date.now() });
      showToast(`Added "${title}" to watchlist`);
    }
  }

  function handlePlay(season?: number, episode?: number) {
    if (!d) return;
    const isTv = type === "tv" || type === "anime" || Boolean(d.number_of_seasons) || Boolean(d.seasons?.length);
    const playType = isTv ? "tv" : "movie";
    const finalSeason = isTv ? (season ?? selectedSeason ?? 1) : undefined;
    let resumeEp = episode;
    if (isTv && resumeEp == null) {
      try {
        const store = JSON.parse(localStorage.getItem("sh_progress_store") || "{}");
        let maxEpTime = 0;
        for (const [k, v] of Object.entries(store) as [string, { updatedAt?: number; episode?: number }][]) {
          if (k.startsWith(`${d.id}_s${finalSeason}e`)) {
            const t = v?.updatedAt || 0;
            if (t > maxEpTime && v?.episode) {
              maxEpTime = t;
              resumeEp = v.episode;
            }
          }
        }
      } catch {}
    }
    const finalEpisode = isTv ? (resumeEp ?? 1) : undefined;
    openPlayer(d.id, playType, title, finalSeason, finalEpisode, d.poster_path ?? undefined);
    addToHistory({
      id: d.id,
      type: playType,
      title,
      poster: d.poster_path,
      vote: d.vote_average || 0,
      date,
      season: finalSeason,
      episode: finalEpisode,
      progress: 0,
      updatedAt: Date.now(),
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("playback-progress-updated"));
    }
  }

  function handleShare() {
    if (!d) return;
    const shareUrl = `https://cinecub.stream/?id=${d.id}&type=${type || "movie"}`;
    const shareData = {
      title: `${title} - Watch Free in HD on CineCub`,
      text: `Stream ${title} online free in Full HD/4K on CineCub:`,
      url: shareUrl,
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {
        navigator.clipboard?.writeText(shareUrl).then(() => showToast("Link copied to clipboard!", "success")).catch(() => {});
      });
    } else {
      navigator.clipboard?.writeText(shareUrl).then(() => showToast("Link copied to clipboard!", "success")).catch(() => {});
    }
  }

  function handleNav(page: "home" | "browse" | "watchlist", category?: string) {
    closeDetail();
    if (page === "home") {
      setActivePage("home");
    } else if (page === "browse" && category) {
      setBrowseCategory(category);
      setActivePage("browse");
    } else if (page === "watchlist") {
      setActivePage("watchlist");
    }
  }

  const isAnime = (d?.genres || []).some((g: { id: number; name?: string }) => g.id === 16 || (g.name && g.name.toLowerCase() === "animation"));
  const activeNavType = isAnime ? "anime" : detailModal ? (detailModal.type === "tv" ? "tv" : "movie") : "movie";

  return (
    <div className="modal-overlay open" id="modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div
        className="fv-modal"
        id="fv-modal"
        onClick={(e) => e.stopPropagation()}
        onScroll={(e) => {
          const isPast = e.currentTarget.scrollTop > 20;
          setIsScrolled((prev) => (prev !== isPast ? isPast : prev));
        }}
      >
        <header className={`fv-top-nav${isScrolled ? " scrolled" : ""}`} id="fv-top-nav">
          <div className="fv-top-nav-inner">
            <div className="fv-top-nav-left">
              <button
                aria-label="Go back"
                className="fv-nav-back-btn"
                id="fv-hero-back"
                onClick={handleBack}
                title={navHistory.length > 0 ? "Go back" : "Close"}
              >
                <i className="fas fa-arrow-left" />
              </button>
              <BrandLogo
                className="fv-brand-logo"
                onClick={() => handleNav("home")}
              />
              <span className={`fv-nav-title ${isPerson || isScrolled ? "visible" : ""}`} id="fv-nav-title">
                {title}
              </span>
            </div>
            <div className="fv-top-nav-center">
              <nav className="cinejoy-nav-center" aria-label="Primary site navigation">
                <div className="cinejoy-nav-pill">
                  <button
                    type="button"
                    className="cinejoy-nav-item"
                    onClick={() => handleNav("home")}
                  >
                    <i className="fas fa-home cinejoy-nav-icon" />
                    <span>Home</span>
                  </button>
                  <button
                    type="button"
                    className={`cinejoy-nav-item${activeNavType === "movie" ? " active" : ""}`}
                    onClick={() => handleNav("browse", "movie")}
                    aria-current={activeNavType === "movie" ? "page" : undefined}
                  >
                    <i className="fas fa-film cinejoy-nav-icon" />
                    <span>Movies</span>
                  </button>
                  <button
                    type="button"
                    className={`cinejoy-nav-item${activeNavType === "tv" ? " active" : ""}`}
                    onClick={() => handleNav("browse", "tv")}
                    aria-current={activeNavType === "tv" ? "page" : undefined}
                  >
                    <i className="fas fa-tv cinejoy-nav-icon" />
                    <span>TV Series</span>
                  </button>
                  <button
                    type="button"
                    className={`cinejoy-nav-item${activeNavType === "anime" ? " active" : ""}`}
                    onClick={() => handleNav("browse", "anime")}
                    aria-current={activeNavType === "anime" ? "page" : undefined}
                  >
                    <i className="fas fa-dragon cinejoy-nav-icon" />
                    <span>Anime</span>
                  </button>
                  <button
                    type="button"
                    className="cinejoy-nav-item"
                    onClick={() => handleNav("watchlist")}
                  >
                    <i className="fas fa-heart cinejoy-nav-icon" />
                    <span>Watchlist</span>
                  </button>
                </div>
              </nav>
            </div>
          </div>
        </header>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "120px 0" }}>
            <i className="fas fa-circle-notch fa-spin" style={{ fontSize: "32px", color: "var(--cv-purple)" }} />
          </div>
        ) : isPerson ? (
          personDetail ? (
            <div className="fv-person-view" id="fv-person-view">
              <div className="fv-person-header">
                <h2 className="fv-person-name" id="fv-person-name">{personDetail.name}</h2>
                <div className="fv-person-socials" id="fv-person-socials">
                  {personDetail.external_ids?.twitter_id && (
                    <a
                      href={`https://twitter.com/${encodeURIComponent(personDetail.external_ids.twitter_id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="fv-social-link"
                      title="Twitter / X"
                    >
                      <i className="fab fa-x-twitter" />
                    </a>
                  )}
                  {personDetail.external_ids?.instagram_id && (
                    <a
                      href={`https://instagram.com/${encodeURIComponent(personDetail.external_ids.instagram_id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="fv-social-link"
                      title="Instagram"
                    >
                      <i className="fab fa-instagram" />
                    </a>
                  )}
                </div>
              </div>

              <div className="fv-person-top">
                <div className="fv-person-left-col">
                  <div className="fv-person-img-wrap">
                    {personDetail.profile_path ? (
                      <img
                        className="fv-person-img"
                        id="fv-person-img"
                        alt={personDetail.name}
                        src={IMG.profile(personDetail.profile_path, "h632") || IMG.profile(personDetail.profile_path, "w342") || ""}
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cv-dark-3)", borderRadius: "12px" }}>
                        <i className="fas fa-user" style={{ fontSize: "48px", color: "var(--text-4)" }} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="fv-person-right-col">
                  <div className="fv-pinfo-box">
                    <div className="fv-pinfo-title">Personal Info</div>
                    <div className="fv-pinfo-list">
                      <div className="fv-pinfo-item" id="fv-pinfo-known-for-row">
                        <span className="fv-pinfo-label">Known For</span>
                        <span className="fv-pinfo-val" id="fv-pinfo-known-for">{personDetail.known_for_department || "Acting"}</span>
                      </div>
                      <div className="fv-pinfo-item" id="fv-pinfo-credits-row">
                        <span className="fv-pinfo-label">Known Credits</span>
                        <span className="fv-pinfo-val" id="fv-pinfo-credits">
                          {(personDetail.combined_credits?.cast?.length || 0) + (personDetail.combined_credits?.crew?.length || 0)}
                        </span>
                      </div>
                      <div className="fv-pinfo-item" id="fv-pinfo-gender-row">
                        <span className="fv-pinfo-label">Gender</span>
                        <span className="fv-pinfo-val" id="fv-pinfo-gender">
                          {personDetail.gender === 1 ? "Female" : personDetail.gender === 2 ? "Male" : personDetail.gender === 3 ? "Non-binary" : "Not specified"}
                        </span>
                      </div>
                      {personDetail.birthday && (
                        <div className="fv-pinfo-item" id="fv-pinfo-birthday-row">
                          <span className="fv-pinfo-label">Birthday</span>
                          <span className="fv-pinfo-val" id="fv-pinfo-birthday">
                            {formatPersonBirthday(personDetail.birthday, personDetail.deathday)}
                          </span>
                        </div>
                      )}
                      {personDetail.place_of_birth && (
                        <div className="fv-pinfo-item" id="fv-pinfo-birthplace-row">
                          <span className="fv-pinfo-label">Place of Birth</span>
                          <span className="fv-pinfo-val" id="fv-pinfo-birthplace">{personDetail.place_of_birth}</span>
                        </div>
                      )}
                      {personDetail.also_known_as && personDetail.also_known_as.length > 0 && (
                        <div className="fv-pinfo-item" id="fv-pinfo-aka-row">
                          <span className="fv-pinfo-label">Also Known As</span>
                          <span className="fv-pinfo-val" id="fv-pinfo-aka">
                            {personDetail.also_known_as.slice(0, 4).join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {personDetail.biography && (
                <div className="fv-person-bio-wrap" id="fv-person-bio-wrap">
                  <div className="fv-section-heading" style={{ marginBottom: "12px" }}>BIOGRAPHY</div>
                  <div className="fv-person-bio" id="fv-person-bio" style={{ whiteSpace: "pre-line" }}>
                    {personDetail.biography.replace(/Description above from the Wikipedia article[^\n<]+/gi, "").trim() || "No biography available."}
                  </div>
                </div>
              )}

              {personDetail.combined_credits?.cast && personDetail.combined_credits.cast.length > 0 && (
                <div className="fv-cast-section" style={{ borderTop: "1px solid var(--b-2)", paddingTop: "24px", marginTop: "24px" }}>
                  <div className="fv-section-heading">KNOWN FOR</div>
                  <HScrollWrapper className="fv-cast-scroll" id="fv-person-cast">
                    {personDetail.combined_credits.cast
                      .filter((x) => x.poster_path)
                      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
                      .slice(0, 30)
                      .map((item) =>
                        renderPosterCardItem(
                          item,
                          "140px",
                          item.title ? "movie" : "tv",
                          item.character || (item.release_date || item.first_air_date || "").slice(0, 4)
                        )
                      )}
                  </HScrollWrapper>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>Actor details unavailable</div>
          )
        ) : d ? (
          <>
            <div className="fv-hero" id="fv-hero">
              <div className="fv-hero-bg-wrap" id="fv-hero-bg-wrap">
                <img
                  alt="backdrop"
                  className="fv-backdrop"
                  id="fv-backdrop"
                  src={IMG.backdrop(d.backdrop_path || d.poster_path, "original") || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="}
                />
                <div className="fv-hero-video-wrap" id="fv-hero-video-wrap">
                  {trailerSource?.type === "mp4" ? (
                    <video
                      id="fv-hero-trailer-video"
                      className="fv-hero-trailer-video fv-hero-video"
                      ref={trailerVideoRef}
                      key={trailerSource.src}
                      src={trailerSource.src}
                      playsInline
                      webkit-playsinline="true"
                      muted
                      loop
                      autoPlay
                      preload="auto"
                      onPlaying={() => {
                        const heroWrap = document.getElementById("fv-hero-video-wrap");
                        const backdropEl = document.getElementById("fv-backdrop");
                        if (heroWrap) {
                          heroWrap.classList.add("is-loaded");
                          heroWrap.style.opacity = "1";
                        }
                        if (backdropEl) backdropEl.style.opacity = "0";
                      }}
                      onCanPlay={() => {
                        const heroWrap = document.getElementById("fv-hero-video-wrap");
                        const backdropEl = document.getElementById("fv-backdrop");
                        if (heroWrap) {
                          heroWrap.classList.add("is-loaded");
                          heroWrap.style.opacity = "1";
                        }
                        if (backdropEl) backdropEl.style.opacity = "0";
                      }}
                    />
                  ) : trailerSource?.type === "youtube" ? (
                    <iframe
                      id="fv-hero-trailer-frame"
                      ref={trailerIframeRef}
                      key={trailerSource.src}
                      className="fv-hero-trailer-frame fv-hero-video"
                      src={`https://www.youtube-nocookie.com/embed/${trailerSource.src}?autoplay=1&mute=1&controls=0&playsinline=1&enablejsapi=1&rel=0&iv_load_policy=3&disablekb=1&modestbranding=1&fs=0&cc_load_policy=0&origin=${encodeURIComponent(typeof window !== "undefined" && window.location.origin && window.location.origin !== "null" ? window.location.origin : "https://cinecub.stream")}`}
                      allow="autoplay; encrypted-media"
                      tabIndex={-1}
                      title="Background Trailer"
                      onLoad={() => {
                        try {
                          trailerIframeRef.current?.contentWindow?.postMessage(
                            JSON.stringify({ event: "listening", id: 1 }),
                            "*"
                          );
                        } catch {}
                      }}
                    />
                  ) : null}
                </div>
                <div className="fv-hero-grad" />
                <CinemaStageCanvas className="fv-hero-canvas" />
                <div className="fv-hero-touch-shield" />
              </div>

              <div className="fv-hero-content-wrap">
                <div className="fv-hero-content">
                  <div className="fv-hero-left">
                    {studioName && (
                      <div className="fv-studio-badge" id="fv-studio-badge">{studioName.toUpperCase()}</div>
                    )}
                    <h1 className="fv-hero-title" id="fv-title">{title}</h1>

                    {d.genres && d.genres.length > 0 && (
                      <div className="fv-genres-pills" id="fv-genres-pills">
                        {d.genres.map((g: { id: number; name: string }) => (
                          <span key={g.id} className="fv-genre-pill">{g.name}</span>
                        ))}
                      </div>
                    )}

                    <div className="fv-actions-row">
                      <button className="btn-fv-play-hero" id="fv-btn-play" onClick={() => handlePlay()}>
                        <i className="fas fa-play" /> WATCH NOW
                      </button>
                      <button className="btn-fv-icon-circle" id="fv-btn-trailer" title="Watch Trailer" onClick={() => trailer && openTrailer(title, trailer.key)} style={{ display: trailer ? "inline-flex" : "none" }}>
                        <i className="fas fa-film" />
                      </button>
                      <button
                        className={`btn-fv-icon-circle ${inWl ? "active" : ""}`}
                        id="fv-btn-watchlist"
                        title={inWl ? "In Watchlist" : "Add to Watchlist"}
                        aria-label={inWl ? "In Watchlist" : "Add to Watchlist"}
                        onClick={toggleWl}
                      >
                        <i className={inWl ? "fa-solid fa-heart" : "fa-regular fa-heart"} />
                      </button>
                      <button className="btn-fv-icon-circle" id="fv-btn-share" title="Share" onClick={handleShare}>
                        <i className="fas fa-share-alt" />
                      </button>
                    </div>

                    <div className="fv-meta-row" id="fv-meta-row">
                      {d.vote_average && d.vote_average > 0 ? (
                        <span className="fv-meta-badge fv-meta-rating" id="fv-rating">★ {formatRating(d.vote_average)}</span>
                      ) : null}
                      {rating && (
                        <span className="fv-meta-badge fv-meta-pg" id="fv-pg">{rating}</span>
                      )}
                      <span className="fv-meta-badge fv-meta-hd" id="fv-quality">4K UHD</span>
                      <span className="fv-meta-badge fv-meta-hdr">HDR10+</span>
                      <span className="fv-meta-badge fv-meta-atmos">DOLBY ATMOS</span>
                      <span className="fv-meta-badge fv-meta-audio">5.1 CH</span>
                      <span className="fv-meta-badge fv-meta-cc">CC</span>
                      <span className="fv-meta-badge" id="fv-year">{year(date)}</span>
                      {runtime(d.runtime || (d.episode_run_time?.[0])) ? (
                        <span className="fv-meta-badge" id="fv-runtime">{runtime(d.runtime || (d.episode_run_time?.[0]))}</span>
                      ) : null}
                    </div>

                    <div className="fv-synopsis-wrap">
                      <div className="fv-synopsis-heading">SYNOPSIS</div>
                      <p className="fv-desc" id="fv-desc">{d.overview || "No synopsis available."}</p>
                    </div>
                  </div>

                  <div className="fv-hero-right">
                    <div className="fv-specs-card">
                      <div className="fv-specs-header">
                        <i className="fas fa-layer-group" />
                        <span>Quick Specs</span>
                      </div>
                      <div className="fv-specs-list">
                        {rating ? (
                          <div className="fv-spec-row" id="fv-spec-rating-row">
                            <span className="fv-spec-k">Rating</span>
                            <span className="fv-spec-v" id="fv-spec-rating">{rating}</span>
                          </div>
                        ) : null}
                        <div className="fv-spec-row" id="fv-spec-quality-row">
                          <span className="fv-spec-k">Quality</span>
                          <span className="fv-spec-v" id="fv-spec-quality">4K UHD · HDR</span>
                        </div>
                        {date ? (
                          <div className="fv-spec-row" id="fv-spec-release-row">
                            <span className="fv-spec-k">Release</span>
                            <span className="fv-spec-v" id="fv-spec-release">{date}</span>
                          </div>
                        ) : null}
                        {d.original_language ? (
                          <div className="fv-spec-row" id="fv-spec-lang-row">
                            <span className="fv-spec-k">Audio</span>
                            <span className="fv-spec-v" id="fv-spec-lang">{d.original_language.toUpperCase()} · Multi Sub</span>
                          </div>
                        ) : null}
                        {director ? (
                          <div className="fv-spec-row" id="fv-spec-director-row">
                            <span className="fv-spec-k">Director</span>
                            <span className="fv-spec-v" id="fv-spec-director">{director.name}</span>
                          </div>
                        ) : null}
                        {d.genres && d.genres.length > 0 ? (
                          <div className="fv-spec-row" id="fv-spec-genres-row">
                            <span className="fv-spec-k">Genres</span>
                            <span className="fv-spec-v" id="fv-spec-genres">{genreNames(d.genres)}</span>
                          </div>
                        ) : null}
                        {type === "tv" && d.number_of_seasons ? (
                          <div className="fv-spec-row">
                            <span className="fv-spec-k">Seasons</span>
                            <span className="fv-spec-v">{d.number_of_seasons} Seasons ({d.number_of_episodes || 0} Episodes)</span>
                          </div>
                        ) : null}
                        {d.budget && d.budget > 0 ? (
                          <div className="fv-spec-row" id="fv-spec-budget-row">
                            <span className="fv-spec-k">Budget</span>
                            <span className="fv-spec-v" id="fv-budget">${(d.budget / 1000000).toFixed(0)}M</span>
                          </div>
                        ) : null}
                        {d.revenue && d.revenue > 0 ? (
                          <div className="fv-spec-row" id="fv-spec-revenue-row">
                            <span className="fv-spec-k">Revenue</span>
                            <span className="fv-spec-v" id="fv-revenue">${(d.revenue / 1000000).toFixed(0)}M</span>
                          </div>
                        ) : null}
                        {d.production_companies && d.production_companies.length > 0 ? (
                          <div className="fv-spec-row" id="fv-spec-studios-row">
                            <span className="fv-spec-k">Studios</span>
                            <span className="fv-spec-v" id="fv-studios">{d.production_companies.slice(0, 2).map((c: { name: string }) => c.name).join(", ")}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <img alt="poster" className="fv-hero-poster" id="fv-poster" src={IMG.poster(d.poster_path) || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="} style={{ display: "none" }} />
            </div>

            <div className="fv-body" id="fv-body">
              {(type === "tv" || type === "anime") && d?.seasons && d.seasons.length > 0 && (
                <div className="fv-episodes-section" id="fv-episodes-section">
                  <div className="fv-section-header-row fv-ep-header-row">
                    <div className="fv-ep-title-group">
                      <div className="section-header-kicker">EPISODE GUIDE</div>
                      <div className="fv-section-heading" id="fv-episodes-header">
                        Episodes {episodes.length > 0 ? `(${episodes.length})` : ""}
                      </div>
                    </div>
                    {seasonOptions.length > 1 && (
                      <div className="fv-season-pills-wrap">
                        <div className="fv-season-pills" role="tablist" aria-label="Seasons">
                          {seasonOptions.map((s) => (
                            <button
                              key={s.value}
                              type="button"
                              role="tab"
                              aria-selected={String(selectedSeason) === s.value}
                              className={`fv-season-pill${String(selectedSeason) === s.value ? " active" : ""}`}
                              onClick={() => setSelectedSeason(Number(s.value))}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <HScrollWrapper className="fv-episodes-scroll" id="fv-episodes-scroll">
                    {loadingEpisodes ? (
                      <div style={{ padding: "32px", textAlign: "center" }}><i className="fas fa-circle-notch fa-spin" style={{ color: "var(--cv-purple)" }} /></div>
                    ) : episodes.length === 0 ? (
                      <div style={{ padding: "24px", color: "var(--text-3)", fontSize: "13px" }}>No episodes available for this season.</div>
                    ) : episodes.map((ep) => (
                      <div
                        key={ep.id}
                        className="fv-episode-card"
                        onClick={() => handlePlay(selectedSeason, ep.episode_number)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handlePlay(selectedSeason, ep.episode_number);
                          }
                        }}
                      >
                        <div className="fv-episode-thumb-wrap">
                          {ep.still_path ? (
                            <img
                              className="fv-episode-thumb"
                              src={IMG.backdrop(ep.still_path, "w300") || ""}
                              alt={ep.name || `Episode ${ep.episode_number}`}
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="fv-episode-placeholder">
                              <i className="fas fa-play" />
                            </div>
                          )}
                          <span className="fv-episode-badge">
                            {selectedSeason === 0 ? `SP${ep.episode_number}` : `E${ep.episode_number}`}
                          </span>
                          {ep.runtime ? (
                            <span className="fv-episode-duration">{ep.runtime}m</span>
                          ) : null}
                          <div className="fv-episode-play-icon">
                            <i className="fas fa-play" />
                          </div>
                        </div>
                        <div className="fv-episode-info">
                          <div className="fv-episode-number-label">
                            Episode {ep.episode_number} {ep.air_date ? `· ${ep.air_date.slice(0, 4)}` : ""}
                          </div>
                          <div className="fv-episode-title" title={ep.name}>
                            {ep.name || `Episode ${ep.episode_number}`}
                          </div>
                          <div className="fv-episode-meta">
                            {ep.overview ? (ep.overview.length > 120 ? `${ep.overview.slice(0, 120)}…` : ep.overview) : "No description available for this episode."}
                          </div>
                        </div>
                      </div>
                    ))}
                  </HScrollWrapper>
                </div>
              )}

              {cast.length > 0 && (
                <div className="fv-cast-section" id="fv-cast-section">
                  <div className="fv-section-heading" id="fv-cast-header">CAST & CREW</div>
                  <HScrollWrapper className="fv-cast-scroll" id="fv-cast">
                    {cast.map((c: CastMember) => (
                      <div
                        key={c.id}
                        className="cast-card"
                        onClick={() => navigateTo(c.id, "person")}
                        title={c.character ? `${c.name} as ${c.character}` : c.name}
                      >
                        <div className="cast-avatar-wrap">
                          <img
                            alt={c.name}
                            className="cast-avatar"
                            src={(c.profile_path ? IMG.profile(c.profile_path, "w185") : null) || IMG.placeholder(110, 110)}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = IMG.placeholder(110, 110);
                            }}
                          />
                        </div>
                        <div className="cast-name">{c.name}</div>
                        <div className="cast-char">{c.character || c.known_for_department || "Cast"}</div>
                      </div>
                    ))}
                  </HScrollWrapper>
                </div>
              )}

              {trailer && d.videos?.results && (
                <div className="fv-trailers-section" id="fv-trailers-section">
                  <div className="fv-section-heading" id="fv-trailers-header">TRAILERS & CLIPS</div>
                  <HScrollWrapper className="fv-trailers-scroll" id="fv-trailers-scroll">
                    {d.videos.results.filter((v: Video) => v.site === "YouTube").slice(0, 5).map((v: Video) => (
                      <div key={v.id} className="fv-trailer-card" onClick={() => openTrailer(v.name, v.key)}>
                        <div className="fv-trailer-thumb-wrap">
                          <img className="fv-trailer-thumb" src={`https://img.youtube.com/vi/${v.key}/mqdefault.jpg`} alt="" />
                          <div className="fv-trailer-play-badge"><i className="fas fa-play" /></div>
                        </div>
                        <div className="fv-trailer-info">
                          <div className="fv-trailer-title">{v.name}</div>
                          <div className="fv-trailer-type">Trailer</div>
                        </div>
                      </div>
                    ))}
                  </HScrollWrapper>
                </div>
              )}

              {similar.length > 0 && (
                <div className="fv-cast-section" id="fv-similar-section">
                  <div className="fv-section-heading">MORE LIKE THIS</div>
                  <HScrollWrapper className="fv-cast-scroll" id="fv-similar">
                    {similar.map((item: MediaItem) =>
                      renderPosterCardItem(item, "170px", type)
                    )}
                  </HScrollWrapper>
                </div>
              )}
            </div>
          </>
        ) : (
          <div
            className="fv-empty-detail-state"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "420px",
              padding: "60px 20px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "rgba(168, 85, 247, 0.12)",
                border: "1px solid rgba(168, 85, 247, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
                color: "var(--cv-purple-light)",
                fontSize: "24px",
              }}
            >
              <i className="fas fa-satellite-dish" />
            </div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#f8fafc", marginBottom: "8px" }}>
              Unable to load title details
            </h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-3)", maxWidth: "380px", marginBottom: "20px", lineHeight: "1.5" }}>
              The server connection timed out or the media index was temporarily unreachable.
            </p>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setRetryCount((c) => c + 1)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 22px",
                  borderRadius: "10px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <i className="fas fa-rotate-right" /> Try Again
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleBack}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  cursor: "pointer",
                }}
              >
                Go Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
