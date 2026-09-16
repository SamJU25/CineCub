"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { fetchBrowse } from "@/lib/api";
import { CFG } from "@/lib/config";
import type { MediaItem } from "@/lib/types";
import CustomSelect from "@/components/CustomSelect";
import { PosterCard } from "@/components/Cards";

export default function BrowsePage() {
  const {
    browseCategory,
    browseType,
    browseSort,
    browseGenreId,
    browseTrendingTime,
    setBrowseType,
    setBrowseSort,
    setBrowseGenreId,
    setBrowseTrendingTime,
  } = useStore((s) => s);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const triggerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(1);
  const fetchingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const renderedKeysRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadNextPageRef = useRef<() => void>(() => {});

  const categoryTitle: Record<string, string> = {
    trending: "Trending",
    popular: "Popular",
    toprated: "Top Rated",
    upcoming: "Upcoming",
    movie: "Movies",
    tv: "TV Series",
    anime: "Anime",
  };

  const isExploreMode = ["trending", "popular", "toprated", "upcoming"].includes(browseCategory);

  // Load next page dynamically without stopping
  const loadNextPage = useCallback(async () => {
    if (fetchingRef.current || !hasMoreRef.current) return;
    fetchingRef.current = true;
    setFetching(true);
    const nextPage = pageRef.current + 1;

    try {
      let data = await fetchBrowse(
        browseCategory,
        browseType,
        browseSort,
        browseGenreId,
        browseTrendingTime,
        nextPage,
        abortControllerRef.current?.signal,
      );

      // Auto-retry once on pagination if request wasn't cancelled
      if (!data && !abortControllerRef.current?.signal?.aborted) {
        await new Promise((r) => setTimeout(r, 450));
        if (!abortControllerRef.current?.signal?.aborted) {
          data = await fetchBrowse(
            browseCategory,
            browseType,
            browseSort,
            browseGenreId,
            browseTrendingTime,
            nextPage,
            abortControllerRef.current?.signal,
          );
        }
      }

      if (abortControllerRef.current?.signal?.aborted) return;

      if (!data || !data.results) {
        return;
      }

      const rawResults: MediaItem[] = data.results || [];
      const uniqueResults: MediaItem[] = [];
      for (const x of rawResults) {
        if (!x || !x.id || !x.poster_path) continue;
        const itemType =
          browseCategory === "anime" || browseType === "anime"
            ? "anime"
            : browseCategory === "movie"
            ? "movie"
            : browseCategory === "tv"
            ? "tv"
            : x.media_type && x.media_type !== "person"
            ? x.media_type
            : browseType === "all"
            ? x.title
              ? "movie"
              : "tv"
            : browseType || (x.title ? "movie" : "tv");
        const key = `${itemType}_${x.id}`;
        if (!renderedKeysRef.current.has(key)) {
          renderedKeysRef.current.add(key);
          uniqueResults.push(x);
        }
      }

      if (uniqueResults.length > 0) {
        setItems((prev) => [...prev, ...uniqueResults]);
      }

      pageRef.current = nextPage;
      setPage(nextPage);

      const maxPages = Math.min(data.total_pages || 500, 500);
      const more = maxPages > nextPage && rawResults.length > 0;
      hasMoreRef.current = more;
      setHasMore(more);

      // If this page returned all duplicates, automatically proceed to next page so user is not stuck
      if (uniqueResults.length === 0 && more) {
        fetchingRef.current = false;
        loadNextPageRef.current();
        return;
      }
    } catch (err) {
      console.warn("[BrowsePage] loadNextPage error:", err);
    } finally {
      fetchingRef.current = false;
      setFetching(false);
    }
  }, [browseCategory, browseType, browseSort, browseGenreId, browseTrendingTime]);

  useEffect(() => {
    loadNextPageRef.current = loadNextPage;
  }, [loadNextPage]);

  // Initial load or filter change
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    pageRef.current = 1;
    fetchingRef.current = false;
    hasMoreRef.current = true;
    renderedKeysRef.current.clear();

    setPage(1);
    setItems([]);
    setError(null);
    setLoading(true);
    setFetching(false);
    setHasMore(true);

    let cancelled = false;
    async function loadInitial() {
      try {
        let data = await fetchBrowse(
          browseCategory,
          browseType,
          browseSort,
          browseGenreId,
          browseTrendingTime,
          1,
          controller.signal,
        );

        if (!data && !controller.signal.aborted) {
          await new Promise((r) => setTimeout(r, 450));
          if (!controller.signal.aborted) {
            data = await fetchBrowse(
              browseCategory,
              browseType,
              browseSort,
              browseGenreId,
              browseTrendingTime,
              1,
              controller.signal,
            );
          }
        }

        if (cancelled || controller.signal.aborted) return;

        if (!data || !data.results || data.results.length === 0) {
          setItems([]);
          setError("No titles found. Please check your connection or reset filters.");
          hasMoreRef.current = false;
          setHasMore(false);
          setLoading(false);
          return;
        }

        const rawResults: MediaItem[] = data.results || [];
        const uniqueResults: MediaItem[] = [];
        for (const x of rawResults) {
          if (!x || !x.id || !x.poster_path) continue;
          const itemType =
            browseCategory === "anime" || browseType === "anime"
              ? "anime"
              : browseCategory === "movie"
              ? "movie"
              : browseCategory === "tv"
              ? "tv"
              : x.media_type && x.media_type !== "person"
              ? x.media_type
              : browseType === "all"
              ? x.title
                ? "movie"
                : "tv"
              : browseType || (x.title ? "movie" : "tv");
          const key = `${itemType}_${x.id}`;
          if (!renderedKeysRef.current.has(key)) {
            renderedKeysRef.current.add(key);
            uniqueResults.push(x);
          }
        }

        setItems(uniqueResults);
        const maxPages = Math.min(data.total_pages || 500, 500);
        const more = maxPages > 1 && rawResults.length > 0;
        hasMoreRef.current = more;
        setHasMore(more);
        setLoading(false);
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setError("Unable to load titles. Please check your connection.");
        setLoading(false);
      }
    }

    loadInitial();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [browseCategory, browseType, browseSort, browseGenreId, browseTrendingTime, reloadToken]);

  // 1. Intersection Observer for infinite scrolling
  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreRef.current && !fetchingRef.current && !loading) {
          loadNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading, loadNextPage]);

  // 2. High-performance window scroll listener to ensure UNLIMITED loading even if observer hiccups
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking || fetchingRef.current || !hasMoreRef.current || loading) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const clientHeight = window.innerHeight || document.documentElement.clientHeight;
        if (scrollTop + clientHeight >= scrollHeight - 800) {
          loadNextPage();
        }
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loading, loadNextPage]);

  const title = categoryTitle[browseCategory] || "Browse";

  return (
    <div className="page-inner">
      <div className="cv-container">
        <div className="browse-header" id="browse-header">
          <div className="browse-title-group">
            <nav aria-label="Breadcrumb" className="browse-breadcrumbs">
              <Link
                href="/"
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                    e.preventDefault();
                    useStore.getState().setActivePage("home");
                  }
                }}
                style={{ color: "inherit", textDecoration: "none" }}
              >
                CineCub
              </Link> &rsaquo; <span id="browse-breadcrumb-title">{title}</span>
            </nav>
            <h1 className="section-title" id="browse-title">{title}</h1>
          </div>
          <div className="browse-filters-wrap">
            {/* 1. All Genres (Always visible across all tabs) */}
            <CustomSelect
              options={[
                { value: "", label: "All Genres" },
                ...CFG.GENRES.map((g) => ({ value: String(g.id), label: g.name })),
              ]}
              value={browseGenreId ? String(browseGenreId) : ""}
              onChange={(val) => setBrowseGenreId(val ? Number(val) : null)}
              id="browse-genre"
              wrapId="wrap-browse-genre"
              ariaLabel="Filter by genre"
              title="Filter by genre"
              className="browse-genre-wrap"
            />

            {/* 2. All Media (Visible on Trending, Popular, Top Rated, Upcoming) */}
            {isExploreMode && (
              <CustomSelect
                options={[
                  { value: "all", label: "All Media" },
                  { value: "movie", label: "Movies" },
                  { value: "tv", label: "TV Series" },
                  { value: "anime", label: "Anime" },
                ]}
                value={browseType}
                onChange={(val) => setBrowseType(val as "all" | "movie" | "tv" | "anime")}
                id="browse-media-type"
                wrapId="wrap-browse-media-type"
                ariaLabel="Filter by media type"
                title="Filter by media type"
                className="browse-media-type-wrap"
              />
            )}

            {/* 3. Sort By (Visible on Movies, TV Series, Anime) */}
            {!isExploreMode && (
              <CustomSelect
                options={[
                  { value: "popular", label: "Popular" },
                  { value: "trending", label: "Trending" },
                  { value: "toprated", label: "Top Rated" },
                  { value: "newest", label: "Newest" },
                ]}
                value={browseSort}
                onChange={setBrowseSort}
                id="browse-sort"
                wrapId="wrap-browse-sort"
                ariaLabel="Sort by"
                title="Sort by"
                className="browse-sort-wrap"
              />
            )}

            {/* 4. Trending Timeframe (Visible on Trending tab OR when Sort By is Trending) */}
            {(browseCategory === "trending" || (!isExploreMode && browseSort === "trending")) && (
              <CustomSelect
                options={[
                  { value: "day", label: "Today" },
                  { value: "week", label: "This Week" },
                ]}
                value={browseTrendingTime}
                onChange={setBrowseTrendingTime}
                id="browse-trending-time"
                wrapId="wrap-browse-trending-time"
                ariaLabel="Filter trending timeframe"
                title="Filter trending timeframe"
                className="browse-trending-time-wrap"
              />
            )}
          </div>
        </div>

        {loading ? (
          <div className="poster-grid" id="browse-grid">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="skeleton-card" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="poster-grid" id="browse-grid">
            {items.map((item) => {
              const itemType =
                browseCategory === "anime" || browseType === "anime"
                  ? "anime"
                  : browseCategory === "movie"
                  ? "movie"
                  : browseCategory === "tv"
                  ? "tv"
                  : item.media_type && item.media_type !== "person"
                  ? item.media_type
                  : browseType === "all"
                  ? item.title
                    ? "movie"
                    : "tv"
                  : browseType || (item.title ? "movie" : "tv");
              return (
                <PosterCard
                  key={`${itemType}-${item.id}`}
                  item={item}
                  type={itemType}
                />
              );
            })}
          </div>
        ) : (
          <div
            className="browse-empty-state"
            style={{
              padding: "60px 20px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "360px",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "rgba(157, 78, 221, 0.12)",
                border: "1px solid rgba(157, 78, 221, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                color: "var(--cv-purple-light, #c77dff)",
                marginBottom: "16px",
              }}
            >
              <i className={error ? "fas fa-wifi-slash" : "fas fa-film"} />
            </div>
            <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", color: "#ffffff" }}>
              {error ? "Unable to Load Titles" : "No Titles Found"}
            </h3>
            <p style={{ fontSize: "14px", color: "var(--text-3, #9ca3af)", maxWidth: "420px", marginBottom: "20px" }}>
              {error
                ? "Could not connect to the media library. Please check your network or try again."
                : "No matching titles were found for the selected filter combination."}
            </p>
            <button
              type="button"
              onClick={() => {
                if (error) {
                  setReloadToken((t) => t + 1);
                } else {
                  setBrowseGenreId(null);
                  setBrowseSort("popular");
                }
              }}
              style={{
                padding: "10px 24px",
                borderRadius: "20px",
                background: "linear-gradient(135deg, #7b2cbf, #9d4edd)",
                color: "#ffffff",
                border: "none",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(157, 78, 221, 0.35)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <i className={error ? "fas fa-rotate-right" : "fas fa-sliders"} />
              {error ? "Retry" : "Reset Filters"}
            </button>
          </div>
        )}

        <div
          ref={triggerRef}
          id="infinite-scroll-trigger"
          style={{ minHeight: "20px", marginTop: "20px", width: "100%", textAlign: "center" }}
        >
          {fetching && (
            <div
              className="browse-infinite-loader"
              id="browse-infinite-spinner"
              style={{ padding: "24px 0", width: "100%", textAlign: "center" }}
            >
              <i
                className="fas fa-circle-notch fa-spin"
                style={{
                  fontSize: "26px",
                  color: "var(--cv-purple)",
                  marginBottom: "8px",
                  display: "inline-block",
                }}
              />
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-3)",
                  fontWeight: 600,
                  letterSpacing: "0.5px",
                }}
              >
                Loading more titles...
              </div>
            </div>
          )}
          {!fetching && hasMore && items.length > 0 && (
            <div style={{ padding: "16px 0 32px" }}>
              <button
                type="button"
                onClick={loadNextPage}
                style={{
                  padding: "8px 24px",
                  borderRadius: "20px",
                  background: "rgba(157, 78, 221, 0.12)",
                  border: "1px solid rgba(157, 78, 221, 0.3)",
                  color: "var(--cv-purple-light, #c77dff)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(157, 78, 221, 0.22)";
                  e.currentTarget.style.borderColor = "var(--cv-purple-light, #c77dff)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(157, 78, 221, 0.12)";
                  e.currentTarget.style.borderColor = "rgba(157, 78, 221, 0.3)";
                }}
              >
                <i className="fas fa-angles-down" /> Load More Titles
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
