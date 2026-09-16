"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { searchTMDB, IMG } from "@/lib/api";
import type { MediaItem } from "@/lib/types";
import ProfilePanel from "@/components/ProfilePanel";
import { BrandLogo } from "@/components/BrandLogo";

export default function Header() {
  const {
    activePage,
    setActivePage,
    browseCategory,
    setBrowseCategory,
    searchQuery,
    setSearchQuery,
    openAuth,
    openApps,
    user,
    toggleProfilePanel,
  } = useStore((s) => s);

  const [searchOpen, setSearchOpen] = useState(false);
  const [dropdown, setDropdown] = useState(false);
  const [results, setResults] = useState<MediaItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seqRef = useRef(0);
  const navPillRef = useRef<HTMLDivElement>(null);
  const navIndicatorRef = useRef<HTMLSpanElement>(null);

  // Detect window scroll for subtle frosted glass darkening
  useEffect(() => {
    let prevScrolled = false;
    const handleScroll = () => {
      const isPast = window.scrollY > 20;
      if (isPast !== prevScrolled) {
        prevScrolled = isPast;
        setScrolled(isPast);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setDropdown(false);
      setActiveIndex(-1);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    setDropdown(true);
    setError(false);
    setActiveIndex(-1);
    try {
      const data = await searchTMDB(q, 1);
      if (seq !== seqRef.current) return;
      const items = (data?.results || [])
        .filter((r: MediaItem) => r.media_type !== "person")
        .slice(0, 8);
      setResults(items);
    } catch {
      if (seq !== seqRef.current) return;
      setResults([]);
      setError(true);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  function onInput(e: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>) {
    const target = e.target as HTMLInputElement;
    const v = target.value;
    setSearchQuery(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => handleSearch(v), 300);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActivePage("search");
      setDropdown(false);
      setSearchOpen(false);
    }
  }

  function selectResult(item: MediaItem) {
    setDropdown(false);
    setSearchOpen(false);
    setSearchQuery("");
    const mediaType = item.media_type || (item.name && !item.title ? "tv" : "movie");
    useStore.getState().openDetail(item.id, mediaType);
  }

  function viewAllResults() {
    if (searchQuery.trim()) {
      setActivePage("search");
      setDropdown(false);
      setSearchOpen(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdown(false);
        if (!searchQuery.trim()) {
          setSearchOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchQuery]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 50);
      } else if (e.key === "/" && !isInput) {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 50);
      } else if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setDropdown(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [searchOpen]);

  function handleNav(page: "home" | "browse" | "watchlist", category?: string) {
    if (page === "home") {
      setActivePage("home");
    } else if (page === "browse" && category) {
      setBrowseCategory(category);
      setActivePage("browse");
    } else if (page === "watchlist") {
      setActivePage("watchlist");
    }
  }

  const isNavActive = (key: string) => {
    if (key === "home") return activePage === "home";
    if (key === "movie") return activePage === "browse" && browseCategory === "movie";
    if (key === "tv") return activePage === "browse" && browseCategory === "tv";
    if (key === "anime") return activePage === "browse" && browseCategory === "anime";
    if (key === "watchlist") return activePage === "watchlist";
    return false;
  };

  const syncNavPill = useCallback(() => {
    const pill = navPillRef.current;
    const indicator = navIndicatorRef.current;
    if (!pill || !indicator) return;
    const activeBtn = pill.querySelector<HTMLElement>(".cinejoy-nav-item.active");
    if (activeBtn) {
      indicator.style.opacity = "1";
      indicator.style.left = `${activeBtn.offsetLeft}px`;
      indicator.style.width = `${activeBtn.offsetWidth}px`;
    } else {
      indicator.style.opacity = "0";
    }
  }, []);

  useEffect(() => {
    const pill = navPillRef.current;
    if (!pill) return;
    syncNavPill();
    const ro = new ResizeObserver(syncNavPill);
    ro.observe(pill);
    if (document.fonts?.ready) {
      document.fonts.ready.then(syncNavPill);
    }
    window.addEventListener("resize", syncNavPill);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncNavPill);
    };
  }, [syncNavPill]);

  useEffect(() => {
    const raf = requestAnimationFrame(syncNavPill);
    return () => cancelAnimationFrame(raf);
  }, [activePage, browseCategory, mounted, syncNavPill]);

  const [isApp, setIsApp] = useState(false);

  useEffect(() => {
    const checkIsApp = () => {
      if (typeof window === "undefined") return;
      const detected = Boolean(
        (window as unknown as { AndroidShare?: unknown }).AndroidShare ||
        (window as unknown as { CineCubAndroid?: unknown }).CineCubAndroid ||
        (window as unknown as { CineCubNativeApp?: unknown }).CineCubNativeApp ||
        (window as unknown as { StreamHeavenAndroid?: unknown }).StreamHeavenAndroid ||
        (window as unknown as { StreamHeavenNativeApp?: unknown }).StreamHeavenNativeApp ||
        (navigator.userAgent && (
          navigator.userAgent.indexOf("CineCubApp") !== -1 ||
          navigator.userAgent.indexOf("StreamHeavenApp") !== -1
        )) ||
        document.documentElement.classList.contains("is-app-env") ||
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
      );
      if (detected) {
        setIsApp(true);
      }
    };
    checkIsApp();
    const t = setTimeout(checkIsApp, 300);
    return () => clearTimeout(t);
  }, []);

  const handleDownloadClick = () => {
    openApps();
  };

  return (
    <header className={`cv-header cinejoy-header${scrolled ? " scrolled" : ""}${activePage !== "home" ? " non-home-nav" : ""}`} id="cv-header">
      {/* FAR LEFT: Platform Logo & Back Button */}
      <div className="header-left-area">
        {activePage !== "home" && (
          <button
            type="button"
            aria-label="Go back to Home"
            className="fv-nav-back-btn"
            id="header-nav-back"
            onClick={() => setActivePage("home")}
            title="Go back to Home"
          >
            <i className="fas fa-arrow-left" />
          </button>
        )}
        <BrandLogo onClick={() => handleNav("home")} />
      </div>

      {/* CENTER: Primary navigation menu - Home, Movies, TV Series, Anime, and Watchlist */}
      <nav className="cinejoy-nav-center" aria-label="Primary site navigation">
        <div className="cinejoy-nav-pill" ref={navPillRef}>
          <span className="cinejoy-nav-active" ref={navIndicatorRef} aria-hidden="true" />
          <button
            type="button"
            className={`cinejoy-nav-item${isNavActive("home") ? " active" : ""}`}
            onClick={() => handleNav("home")}
            aria-current={isNavActive("home") ? "page" : undefined}
          >
            <i className="fas fa-home cinejoy-nav-icon" />
            <span>Home</span>
          </button>
          <button
            type="button"
            className={`cinejoy-nav-item${isNavActive("movie") ? " active" : ""}`}
            onClick={() => handleNav("browse", "movie")}
            aria-current={isNavActive("movie") ? "page" : undefined}
          >
            <i className="fas fa-film cinejoy-nav-icon" />
            <span>Movies</span>
          </button>
          <button
            type="button"
            className={`cinejoy-nav-item${isNavActive("tv") ? " active" : ""}`}
            onClick={() => handleNav("browse", "tv")}
            aria-current={isNavActive("tv") ? "page" : undefined}
          >
            <i className="fas fa-tv cinejoy-nav-icon" />
            <span>TV Series</span>
          </button>
          <button
            type="button"
            className={`cinejoy-nav-item${isNavActive("anime") ? " active" : ""}`}
            onClick={() => handleNav("browse", "anime")}
            aria-current={isNavActive("anime") ? "page" : undefined}
          >
            <i className="fas fa-dragon cinejoy-nav-icon" />
            <span>Anime</span>
          </button>
          <button
            type="button"
            className={`cinejoy-nav-item${isNavActive("watchlist") ? " active" : ""}`}
            onClick={() => handleNav("watchlist")}
            aria-current={isNavActive("watchlist") ? "page" : undefined}
          >
            <i className="fas fa-heart cinejoy-nav-icon" />
            <span>Watchlist</span>
          </button>
        </div>
      </nav>

      {/* FAR RIGHT: Search icon and user profile section */}
      <div className="header-right-area">
        {/* Search Container */}
        <div
          className={`cinejoy-search-wrap${searchOpen ? " open" : ""}`}
          ref={searchContainerRef}
        >
          {searchOpen ? (
            <div className="cinejoy-search-expanded">
              <i className="fas fa-search search-icon-inner" />
              <input
                ref={inputRef}
                autoComplete="off"
                className="cinejoy-search-input"
                id="search-input"
                aria-label="Search movies, shows, anime"
                placeholder="Search titles, actors, anime..."
                type="text"
                value={searchQuery}
                onChange={onInput}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (results.length > 0) {
                      setDropdown(true);
                      setActiveIndex((prev) => (prev + 1 < results.length ? prev + 1 : 0));
                    }
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (results.length > 0) {
                      setDropdown(true);
                      setActiveIndex((prev) => (prev - 1 >= 0 ? prev - 1 : results.length - 1));
                    }
                  } else if (e.key === "Enter") {
                    if (dropdown && activeIndex >= 0 && activeIndex < results.length) {
                      e.preventDefault();
                      selectResult(results[activeIndex]);
                    } else {
                      onSubmit(e);
                    }
                  } else if (e.key === "Escape") {
                    setDropdown(false);
                    setSearchOpen(false);
                  }
                }}
              />
              <button
                type="button"
                className="search-close-btn"
                onClick={() => {
                  if (searchQuery) {
                    setSearchQuery("");
                    setResults([]);
                    setActiveIndex(-1);
                    setDropdown(false);
                    inputRef.current?.focus();
                  } else {
                    setSearchOpen(false);
                    setDropdown(false);
                    setActiveIndex(-1);
                  }
                }}
                aria-label={searchQuery ? "Clear search" : "Close search"}
                title={searchQuery ? "Clear search" : "Close search (Esc)"}
              >
                <i className="fas fa-times" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="cinejoy-action-btn search-trigger-btn"
              onClick={() => setSearchOpen(true)}
              title="Search (Ctrl+K)"
              aria-label="Search"
            >
              <i className="fas fa-search" />
            </button>
          )}

          {/* Autocomplete Results Dropdown */}
          <div
            className={`search-results-dropdown cinejoy-search-dropdown${
              dropdown && searchOpen ? " open" : ""
            }`}
            id="search-dropdown"
          >
            <div className="srd-header">
              <span>Quick Results</span>
              <span className="srd-shortcuts">
                <kbd>↑↓</kbd> navigate <kbd>↵</kbd> select
              </span>
            </div>
            <div className="srd-results" id="srd-results">
              {loading && (
                <div style={{ padding: "16px", textAlign: "center" }}>
                  <i
                    className="fas fa-circle-notch fa-spin"
                    style={{ color: "var(--cv-purple)", fontSize: "18px" }}
                  />
                </div>
              )}
              {!loading && error && (
                <div
                  style={{
                    padding: "16px",
                    textAlign: "center",
                    color: "var(--cv-red)",
                    fontSize: "12px",
                  }}
                >
                  Error loading results.
                </div>
              )}
              {!loading &&
                !error &&
                results.length === 0 &&
                searchQuery.trim() && (
                  <div
                    style={{
                      padding: "16px",
                      textAlign: "center",
                      color: "var(--text-3)",
                      fontSize: "12px",
                    }}
                  >
                    No results found
                  </div>
                )}
              {results.map((item, idx) => (
                <div
                  key={item.id}
                  className={`srd-item${idx === activeIndex ? " active" : ""}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => selectResult(item)}
                >
                  <img
                    className="srd-poster"
                    src={IMG.poster(item.poster_path, "w92") || ""}
                    alt={item.title || item.name || ""}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="srd-info">
                    <div className="srd-title">{item.title || item.name}</div>
                    <div className="srd-meta">
                      {item.media_type === "movie" ? "Movie" : "TV"} ·{" "}
                      {item.release_date?.slice(0, 4) ||
                        item.first_air_date?.slice(0, 4) ||
                        "—"}
                      {item.vote_average
                        ? ` · ★ ${item.vote_average.toFixed(1)}`
                        : ""}
                    </div>
                  </div>
                </div>
              ))}
              {!loading && !error && results.length > 0 && (
                <div className="srd-view-all" onClick={viewAllResults}>
                  View all results{" "}
                  <i
                    className="fas fa-arrow-right"
                    style={{ marginLeft: "5px" }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Download App / APK button (hidden in app) */}
        {!isApp && (
          <button
            onClick={handleDownloadClick}
            className="cinejoy-action-btn app-download-btn header-app-btn"
            title="Download CineCub App"
            aria-label="Download App"
          >
            <i className="fas fa-download" />
          </button>
        )}

        {/* User Profile Section */}
        <div className="cinejoy-profile-wrap" id="header-profile-container">
          <button
            className={`cinejoy-profile-btn${activePage === "profile" ? " active" : ""}`}
            id="header-profile-btn"
            onClick={mounted && user ? toggleProfilePanel : openAuth}
            title={mounted && user ? (user.displayName || "My Profile") : "Sign In / Profile"}
            aria-label="User Profile"
          >
            {mounted && user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || "User"}
                className="cinejoy-profile-img"
              />
            ) : mounted && user ? (
              <span className="cinejoy-profile-initial">
                {(user.displayName || "U")[0].toUpperCase()}
              </span>
            ) : (
              <i className="fas fa-user cinejoy-profile-icon" />
            )}
          </button>
          <ProfilePanel />
        </div>
      </div>
    </header>
  );
}
