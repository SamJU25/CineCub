"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { searchTMDB } from "@/lib/api";
import type { MediaItem } from "@/lib/types";
import { PosterCard } from "@/components/Cards";

export default function SearchPage() {
  const { searchQuery, setActivePage, activePage } = useStore(
    useShallow((s) => ({
      searchQuery: s.searchQuery,
      setActivePage: s.setActivePage,
      activePage: s.activePage,
    }))
  );
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  const doSearch = useCallback(async (q: string, pageNum: number, reset = false) => {
    if (!q.trim()) return;
    const seq = ++seqRef.current;
    if (pageNum === 1) setLoading(true);
    else setFetching(true);
    try {
      const data = await searchTMDB(q, pageNum);
      if (seq !== seqRef.current) return;
      const results = (data?.results || []).filter((r: MediaItem) => r.media_type !== "person");
      if (reset) setItems(results);
      else setItems((prev) => [...prev, ...results]);
      setHasMore(results.length >= 19 && (data?.total_pages || 0) > pageNum);
    } catch {
      if (seq === seqRef.current) setHasMore(false);
    } finally {
      if (seq === seqRef.current) { setLoading(false); setFetching(false); }
    }
  }, []);

  useEffect(() => {
    if (activePage !== "search") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        setPage(1);
        setItems([]);
        doSearch(searchQuery, 1, true);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, doSearch, activePage]);

  useEffect(() => {
    if (activePage !== "search" || page <= 1) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) doSearch(searchQuery, page);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [page, doSearch, searchQuery, activePage]);

  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !fetching && !loading) setPage((p) => p + 1);
    }, { rootMargin: "400px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, fetching, loading]);

  return (
    <div className="page-inner">
      <div className="cv-container">
        <div className="browse-header" id="search-header" style={{ marginBottom: "20px" }}>
          <div className="browse-title-group">
            <nav aria-label="Breadcrumb" className="browse-breadcrumbs">
              <Link
                href="/"
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                    e.preventDefault();
                    setActivePage("home");
                  }
                }}
                style={{ cursor: "pointer", color: "inherit", fontWeight: 600, textDecoration: "none" }}
              >
                <i className="fas fa-home" style={{ marginRight: "3px" }} /> Home
              </Link> &rsaquo; <span id="search-breadcrumb-query">Search Results</span>
            </nav>
            <div className="section-header-kicker">DATABASE MATCHES</div>
            <h1 className="section-title" id="search-title" style={{ margin: 0, fontSize: "24px", fontWeight: 900 }}>Search Results</h1>
          </div>
        </div>

        <div className="poster-grid" id="search-full-grid">
          {loading
            ? Array.from({ length: 18 }).map((_, i) => <div key={i} className="skeleton-card" />)
            : items.map((item) => (
                <PosterCard key={`${item.id}-${item.media_type}`} item={item} />
              ))
          }
        </div>

        <div ref={triggerRef} id="search-infinite-scroll-trigger" style={{ height: "20px", marginTop: "20px" }} />
      </div>
    </div>
  );
}
