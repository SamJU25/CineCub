"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useStore, type Page } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

export default function Sidebar() {
  const {
    activePage,
    setActivePage,
    browseCategory,
    setBrowseCategory,
    sidebarCollapsed,
    sidebarOpen,
    closeSidebar,
    openAuth,
    user,
    openLogoutConfirm,
    watchlist,
    history,
  } = useStore(
    useShallow((s) => ({
      activePage: s.activePage,
      setActivePage: s.setActivePage,
      browseCategory: s.browseCategory,
      setBrowseCategory: s.setBrowseCategory,
      sidebarCollapsed: s.sidebarCollapsed,
      sidebarOpen: s.sidebarOpen,
      closeSidebar: s.closeSidebar,
      openAuth: s.openAuth,
      user: s.user,
      openLogoutConfirm: s.openLogoutConfirm,
      watchlist: s.watchlist,
      history: s.history,
    }))
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function handleNav(page: Page, category?: string, e?: React.MouseEvent) {
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0)) {
      return;
    }
    if (e) {
      e.preventDefault();
    }
    if (category) setBrowseCategory(category);
    setActivePage(page);
    closeSidebar();
  }

  function isActive(id: string) {
    if (activePage === "home" && id === "nav-home") return true;
    if (activePage === "browse") {
      if (id === "nav-movies" && browseCategory === "movie") return true;
      if (id === "nav-tv" && browseCategory === "tv") return true;
      if (id === "nav-anime" && browseCategory === "anime") return true;
      if (id === "nav-trending" && browseCategory === "trending") return true;
      if (id === "nav-popular" && browseCategory === "popular") return true;
      if (id === "nav-toprated" && browseCategory === "toprated") return true;
      if (id === "nav-upcoming" && browseCategory === "upcoming") return true;
    }
    if (activePage === "watchlist" && id === "nav-watchlist") return true;
    if (activePage === "history" && id === "nav-history") return true;
    return false;
  }

  return (
    <>
      <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={closeSidebar} />
      <aside className={`cv-sidebar${sidebarCollapsed ? " collapsed" : ""}${sidebarOpen ? " mobile-open" : ""}`} id="cv-sidebar">
        <Link href="/" className="sidebar-logo" onClick={(e) => handleNav("home", undefined, e)} aria-label="CineCub Home">
          <img src="/assets/images/icon-logo.png" alt="CineCub Icon" className="sidebar-logo-icon-img" />
          <span className="sidebar-logo-text">CineCub</span>
        </Link>

        <nav className="sidebar-nav" id="sidebar-nav">
          <div className="nav-section-label">Discover</div>

          <Link href="/" className={`nav-item${isActive("nav-home") ? " active" : ""}`} id="nav-home" onClick={(e) => handleNav("home", undefined, e)}>
            <span className="nav-item-icon"><i className="fas fa-home" /></span>
            <span className="nav-item-text">Home</span>
            <i className="fas fa-chevron-right nav-arrow" />
          </Link>
          <Link href="/?page=browse&cat=movie" className={`nav-item${isActive("nav-movies") ? " active" : ""}`} id="nav-movies" onClick={(e) => handleNav("browse", "movie", e)}>
            <span className="nav-item-icon"><i className="fas fa-film" /></span>
            <span className="nav-item-text">Movies</span>
            <i className="fas fa-chevron-right nav-arrow" />
          </Link>
          <Link href="/?page=browse&cat=tv" className={`nav-item${isActive("nav-tv") ? " active" : ""}`} id="nav-tv" onClick={(e) => handleNav("browse", "tv", e)}>
            <span className="nav-item-icon"><i className="fas fa-tv" /></span>
            <span className="nav-item-text">TV Series</span>
            <i className="fas fa-chevron-right nav-arrow" />
          </Link>
          <Link href="/?page=browse&cat=anime" className={`nav-item${isActive("nav-anime") ? " active" : ""}`} id="nav-anime" onClick={(e) => handleNav("browse", "anime", e)}>
            <span className="nav-item-icon"><i className="fas fa-dragon" /></span>
            <span className="nav-item-text">Anime</span>
            <i className="fas fa-chevron-right nav-arrow" />
          </Link>
          <Link href="/?page=browse&cat=trending" className={`nav-item${isActive("nav-trending") ? " active" : ""}`} id="nav-trending" onClick={(e) => handleNav("browse", "trending", e)}>
            <span className="nav-item-icon"><i className="fas fa-fire" /></span>
            <span className="nav-item-text">Trending</span>
            <span className="nav-badge">HOT</span>
            <i className="fas fa-chevron-right nav-arrow" />
          </Link>
          <Link href="/?page=browse&cat=popular" className={`nav-item${isActive("nav-popular") ? " active" : ""}`} id="nav-popular" onClick={(e) => handleNav("browse", "popular", e)}>
            <span className="nav-item-icon"><i className="fas fa-chart-line" /></span>
            <span className="nav-item-text">Popular</span>
            <i className="fas fa-chevron-right nav-arrow" />
          </Link>
          <Link href="/?page=browse&cat=toprated" className={`nav-item${isActive("nav-toprated") ? " active" : ""}`} id="nav-toprated" onClick={(e) => handleNav("browse", "toprated", e)}>
            <span className="nav-item-icon"><i className="fas fa-star" /></span>
            <span className="nav-item-text">Top Rated</span>
            <i className="fas fa-chevron-right nav-arrow" />
          </Link>
          <Link href="/?page=browse&cat=upcoming" className={`nav-item${isActive("nav-upcoming") ? " active" : ""}`} id="nav-upcoming" onClick={(e) => handleNav("browse", "upcoming", e)}>
            <span className="nav-item-icon"><i className="fas fa-calendar-alt" /></span>
            <span className="nav-item-text">Upcoming</span>
            <i className="fas fa-chevron-right nav-arrow" />
          </Link>

          <div className="nav-section-label library-label">My Library</div>

          <Link href="/?page=watchlist" className={`nav-item${isActive("nav-watchlist") ? " active" : ""}`} id="nav-watchlist" onClick={(e) => handleNav("watchlist", undefined, e)}>
            <span className="nav-item-icon"><i className="fas fa-heart" /></span>
            <span className="nav-item-text">Watchlist</span>
            {mounted && watchlist.length > 0 && (
              <span className="nav-badge">
                {watchlist.length}
              </span>
            )}
            <i className="fas fa-chevron-right nav-arrow" />
          </Link>
          <Link href="/?page=history" className={`nav-item${isActive("nav-history") ? " active" : ""}`} id="nav-history" onClick={(e) => handleNav("history", undefined, e)}>
            <span className="nav-item-icon"><i className="fas fa-history" /></span>
            <span className="nav-item-text">History</span>
            {mounted && history.length > 0 && (
              <span className="nav-badge">
                {history.length}
              </span>
            )}
            <i className="fas fa-chevron-right nav-arrow" />
          </Link>
        </nav>

        <div className="cv-sidebar-bottom">
          {mounted && user ? (
            <>
              <Link href="/?page=profile" className="sf-profile" onClick={(e) => handleNav("profile", undefined, e)} style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}>
                <div className="sf-avatar active">
                  <img
                    src={user.photoURL}
                    alt="User Avatar"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/assets/avatars/av_1.png";
                    }}
                  />
                </div>
                <div className="sf-info">
                  <div className="sf-name">{user.displayName}</div>
                  <div className="sf-status">Active Session</div>
                </div>
              </Link>
              <button className="sf-logout-btn" onClick={(e) => { e.stopPropagation(); openLogoutConfirm(); }} title="Logout">
                <svg className="sf-logout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span className="sf-logout-text">Logout</span>
              </button>
            </>
          ) : (
            <div className="sf-profile guest" onClick={openAuth}>
              <div className="sf-avatar"><i className="fas fa-user" /></div>
              <div className="sf-info">
                <div className="sf-name">Guest Mode</div>
                <div className="sf-status">Sign in / Sign up</div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
