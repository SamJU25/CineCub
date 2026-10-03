"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useStore, type Page } from "@/lib/store";
import { syncUserOnLogin, syncUserProfile } from "@/lib/sync";
import Header from "@/components/Header";
import MobileBottomBar from "@/components/MobileBottomBar";
import Footer from "@/components/Footer";
import ProgressBar from "@/components/ProgressBar";
import ToastContainer from "@/components/Toast";
import HomePage from "@/components/HomePage";
import BrowsePage from "@/components/BrowsePage";
import SearchPage from "@/components/SearchPage";
import WatchlistPage from "@/components/WatchlistPage";
import HistoryPage from "@/components/HistoryPage";
import DetailModal from "@/components/DetailModal";
import { TrailerModal, LegalModal, AppsModal } from "@/components/Modals";
import AuthModal from "@/components/AuthModal";
import ProfilePage from "@/components/ProfilePage";
import LogoutConfirmModal from "@/components/LogoutConfirmModal";
import InstallBanner from "@/components/InstallBanner";

const PlayerModal = dynamic(() => import("@/components/PlayerModal"), {
  ssr: false,
  loading: () => null,
});

interface InitialParams {
  id?: string;
  type?: string;
  page?: string;
  cat?: string;
  genre?: string;
  q?: string;
  s?: string;
  e?: string;
}

export default function AppShell({
  initialPage,
  initialParams,
}: {
  initialPage?: "home" | "browse" | "search" | "watchlist" | "history" | "profile";
  initialParams?: InitialParams;
}) {
  const activePage = useStore((s) => s.activePage);
  const setActivePage = useStore((s) => s.setActivePage);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const playerModal = useStore((s) => s.playerModal);
  const [visitedPages, setVisitedPages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let id = initialParams?.id;
    let type = initialParams?.type;
    let page = initialParams?.page;
    let cat = initialParams?.cat;
    let genre = initialParams?.genre;
    let q = initialParams?.q;
    let s = initialParams?.s;
    let e = initialParams?.e;

    if (typeof window !== "undefined" && !id && !cat && !q) {
      try {
        const sp = new URLSearchParams(window.location.search);
        id = sp.get("id") || undefined;
        type = sp.get("type") || undefined;
        page = sp.get("page") || undefined;
        cat = sp.get("cat") || undefined;
        genre = sp.get("genre") || undefined;
        q = sp.get("q") || undefined;
        s = sp.get("s") || undefined;
        e = sp.get("e") || undefined;
      } catch {}
    }

    if (id) {
      const numId = parseInt(id, 10);
      if (!isNaN(numId)) {
        if (s && e) {
          useStore.getState().openPlayer(numId, type || "tv", "", parseInt(s, 10), parseInt(e, 10));
        } else {
          useStore.getState().openDetail(numId, type || "movie");
        }
      }
    } else if (cat) {
      const genreId = genre ? parseInt(genre, 10) : null;
      useStore.getState().setBrowseCategory(cat, isNaN(genreId as number) ? null : genreId);
      useStore.getState().setActivePage("browse");
    } else if (q) {
      useStore.getState().setSearchQuery(q);
      useStore.getState().setActivePage("search");
    } else if (page && ["home", "browse", "search", "watchlist", "history", "profile"].includes(page)) {
      useStore.getState().setActivePage(page as Page);
    } else {
      const currentActive = useStore.getState().activePage;
      const p = initialPage || currentActive || "home";
      setActivePage(p);
      setVisitedPages({ [p]: true });
    }
  }, [initialParams, initialPage, setActivePage]);

  useEffect(() => {
    const handlePopState = () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const id = sp.get("id");
        const cat = sp.get("cat");
        const page = sp.get("page");
        const q = sp.get("q");

        if (id) {
          const numId = parseInt(id, 10);
          if (!isNaN(numId)) {
            useStore.getState().openDetail(numId, sp.get("type") || "movie");
          }
        } else {
          useStore.getState().closeDetail();
          useStore.getState().closePlayer();
        }

        if (cat) {
          useStore.getState().setBrowseCategory(cat);
          useStore.getState().setActivePage("browse");
        } else if (q) {
          useStore.getState().setSearchQuery(q);
          useStore.getState().setActivePage("search");
        } else if (page && ["home", "browse", "search", "watchlist", "history", "profile"].includes(page)) {
          useStore.getState().setActivePage(page as Page);
        } else if (!id && !cat && !page && !q) {
          useStore.getState().setActivePage("home");
        }
      } catch {}
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    setVisitedPages((prev) => (prev[activePage] ? prev : { ...prev, [activePage]: true }));
  }, [activePage]);

  useEffect(() => {
    const btn = document.getElementById("back-to-top");
    if (!btn) return;
    let isVisible = false;
    const onScroll = () => {
      const shouldShow = window.scrollY > 300;
      if (shouldShow !== isVisible) {
        isVisible = shouldShow;
        btn.classList.toggle("visible", shouldShow);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const u = useStore.getState().user;
    if (u?.uid) {
      syncUserOnLogin(u.uid);
      syncUserProfile();
    }

    let lastSyncTime = Date.now();
    const syncAll = () => {
      const currentUser = useStore.getState().user;
      if (!currentUser?.uid) return;
      const now = Date.now();
      if (now - lastSyncTime < 10000) return; // Throttle to at most once per 10s
      lastSyncTime = now;
      syncUserOnLogin(currentUser.uid);
      syncUserProfile();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        syncAll();
      }
    };
    const onFocus = () => {
      syncAll();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <div className="cv-app">
      <ProgressBar />
      <ToastContainer />

      <main id="cv-main" className={`cv-main${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <Header />

        <div className={`cv-page${activePage === "home" ? " active" : ""}`} id="page-home" style={activePage !== "home" ? { display: "none" } : undefined}>
          <HomePage />
        </div>
        <div className={`cv-page${activePage === "browse" ? " active" : ""}`} id="page-browse" style={activePage !== "browse" ? { display: "none" } : undefined}>
          {visitedPages["browse"] && <BrowsePage />}
        </div>
        <div className={`cv-page${activePage === "search" ? " active" : ""}`} id="page-search" style={activePage !== "search" ? { display: "none" } : undefined}>
          {visitedPages["search"] && <SearchPage />}
        </div>
        <div className={`cv-page${activePage === "watchlist" ? " active" : ""}`} id="page-watchlist" style={activePage !== "watchlist" ? { display: "none" } : undefined}>
          {visitedPages["watchlist"] && <WatchlistPage />}
        </div>
        <div className={`cv-page${activePage === "history" ? " active" : ""}`} id="page-history" style={activePage !== "history" ? { display: "none" } : undefined}>
          {visitedPages["history"] && <HistoryPage />}
        </div>
        <div className={`cv-page${activePage === "profile" ? " active" : ""}`} id="page-profile" style={activePage !== "profile" ? { display: "none" } : undefined}>
          {visitedPages["profile"] && <ProfilePage />}
        </div>

        <Footer />
      </main>

      <MobileBottomBar />
      <DetailModal />
      {playerModal && <PlayerModal />}
      <TrailerModal />
      <LegalModal />
      <AppsModal />
      <AuthModal />
      <LogoutConfirmModal />
      <InstallBanner />

      <button
        id="back-to-top"
        className="back-to-top"
        aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <i className="fas fa-chevron-up" />
      </button>
    </div>
  );
}
