"use client";

import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

const TABS = [
  { id: "home", icon: "fas fa-home", label: "Home", page: "home" as const },
  { id: "movies", icon: "fas fa-film", label: "Movies", page: "browse" as const, category: "movie" },
  { id: "tv", icon: "fas fa-tv", label: "TV Series", page: "browse" as const, category: "tv" },
  { id: "anime", icon: "fas fa-dragon", label: "Anime", page: "browse" as const, category: "anime" },
  { id: "watchlist", icon: "fas fa-heart", label: "Watchlist", page: "watchlist" as const },
];

export default function MobileBottomBar() {
  const { activePage, browseCategory, setActivePage, setBrowseCategory, closeDetail, authModal, playerModal } = useStore(
    useShallow((s) => ({
      activePage: s.activePage,
      browseCategory: s.browseCategory,
      setActivePage: s.setActivePage,
      setBrowseCategory: s.setBrowseCategory,
      closeDetail: s.closeDetail,
      authModal: s.authModal,
      playerModal: s.playerModal,
    }))
  );

  if (authModal || Boolean(playerModal) || activePage === "profile") return null;

  function currentId() {
    if (activePage === "home") return "home";
    if (activePage === "browse") return browseCategory;
    if (activePage === "watchlist") return "watchlist";
    return "";
  }

  const active = currentId();

  return (
    <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
      {TABS.map((tab) => {
        const isAct = tab.category ? active === tab.category : active === tab.id;
        return (
          <button
            key={tab.id}
            className={`mbb-btn${isAct ? " active" : ""}`}
            id={`mbb-${tab.id}`}
            onClick={() => {
              try {
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                  navigator.vibrate(10);
                }
              } catch {}
              closeDetail();
              if (tab.category) setBrowseCategory(tab.category);
              setActivePage(tab.page);
            }}
            aria-current={isAct ? "page" : undefined}
          >
            <div className="mbb-icon-wrap">
              <i className={tab.icon} />
            </div>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
