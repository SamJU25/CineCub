"use client";

import { useRef, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

export default function ProfilePanel() {
  const {
    user,
    profilePanelOpen,
    closeProfilePanel,
    setActivePage,
    openLogoutConfirm,
  } = useStore(
    useShallow((s) => ({
      user: s.user,
      profilePanelOpen: s.profilePanelOpen,
      closeProfilePanel: s.closeProfilePanel,
      setActivePage: s.setActivePage,
      openLogoutConfirm: s.openLogoutConfirm,
    }))
  );

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profilePanelOpen) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        menuRef.current &&
        (menuRef.current.contains(target) || (e.composedPath && e.composedPath().includes(menuRef.current)))
      ) {
        return;
      }
      // Also ignore clicks on the profile button itself (handled by toggleProfilePanel)
      const btn = document.getElementById("header-profile-btn");
      if (btn && (btn.contains(target) || (e.composedPath && e.composedPath().includes(btn)))) {
        return;
      }
      closeProfilePanel();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeProfilePanel();
    }

    document.addEventListener("click", handleClickOutside, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClickOutside, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profilePanelOpen, closeProfilePanel]);

  if (!profilePanelOpen || !user) return null;

  const handleNav = (action: "manage" | "watchlist" | "history" | "account" | "logout") => {
    closeProfilePanel();
    if (action === "manage") {
      try { sessionStorage.setItem("pf_tab", "overview"); } catch {}
      setActivePage("profile");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("switch-profile-tab", { detail: "overview" }));
      }
    } else if (action === "watchlist") {
      setActivePage("watchlist");
    } else if (action === "history") {
      setActivePage("history");
    } else if (action === "account") {
      try { sessionStorage.setItem("pf_tab", "account"); } catch {}
      setActivePage("profile");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("switch-profile-tab", { detail: "account" }));
      }
    } else if (action === "logout") {
      openLogoutConfirm();
    }
  };

  return (
    <div className="simple-profile-dropdown" ref={menuRef} id="simple-profile-dropdown" role="menu">
      <button
        type="button"
        className="simple-profile-item"
        onClick={() => handleNav("manage")}
        role="menuitem"
      >
        <svg className="simple-profile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>Manage</span>
      </button>

      <div className="simple-profile-divider" />

      <button
        type="button"
        className="simple-profile-item"
        onClick={() => handleNav("watchlist")}
        role="menuitem"
      >
        <svg className="simple-profile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        <span>My Watchlist</span>
      </button>

      <button
        type="button"
        className="simple-profile-item"
        onClick={() => handleNav("history")}
        role="menuitem"
      >
        <svg className="simple-profile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="12 8 12 12 14 14" />
          <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
        </svg>
        <span>Watch History</span>
      </button>

      <button
        type="button"
        className="simple-profile-item"
        onClick={() => handleNav("account")}
        role="menuitem"
      >
        <svg className="simple-profile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span>Account Settings</span>
      </button>

      <div className="simple-profile-divider" />

      <button
        type="button"
        className="simple-profile-item simple-profile-item-logout"
        onClick={() => handleNav("logout")}
        role="menuitem"
      >
        <svg className="simple-profile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>Logout</span>
      </button>
    </div>
  );
}
