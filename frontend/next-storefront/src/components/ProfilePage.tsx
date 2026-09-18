"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { showToast } from "@/components/Toast";
import { IMG } from "@/lib/api";
import { CustomerSupportCard } from "@/components/CustomerSupportCard";
import { scheduleCloudPush, ensureToken } from "@/lib/sync";
import type { StoredUser } from "@/lib/user-sync";

const AVATARS = Array.from({ length: 21 }, (_, i) => `/assets/avatars/av_${i + 1}.png`);
type TabId = "overview" | "library" | "account" | "support" | "actions";

export default function ProfilePage() {
  const {
    user,
    setUser,
    logout,
    watchlist,
    history,
    clearHistory,
    clearWatchlist,
    setActivePage,
    openDetail,
    openAuth,
    openLegal,
    openLogoutConfirm,
  } = useStore(
    useShallow((s) => ({
      user: s.user,
      setUser: s.setUser,
      logout: s.logout,
      watchlist: s.watchlist,
      history: s.history,
      clearHistory: s.clearHistory,
      clearWatchlist: s.clearWatchlist,
      setActivePage: s.setActivePage,
      openDetail: s.openDetail,
      openAuth: s.openAuth,
      openLegal: s.openLegal,
      openLogoutConfirm: s.openLogoutConfirm,
    }))
  );

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [isMobileDetail, setIsMobileDetail] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("pf_tab");
      if (saved && ["overview", "library", "account", "support", "actions"].includes(saved)) {
        setActiveTab(saved as TabId);
        sessionStorage.removeItem("pf_tab");
      }
    } catch {}

    const onSwitch = (e: Event) => {
      const customEvent = e as CustomEvent<TabId>;
      if (customEvent?.detail && ["overview", "library", "account", "support", "actions"].includes(customEvent.detail)) {
        setActiveTab(customEvent.detail);
      }
    };
    window.addEventListener("switch-profile-tab", onSwitch);
    return () => window.removeEventListener("switch-profile-tab", onSwitch);
  }, []);

  // Modals state
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
  }>({
    open: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Edit states
  const [selectedAvatar, setSelectedAvatar] = useState("");
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"checking" | "available" | "taken" | "invalid" | null>(null);
  const usernameCheckRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [currEmail, setCurrEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPass, setEmailPass] = useState("");
  const [showEmailPass, setShowEmailPass] = useState(false);
  const [currPassword, setCurrPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrPass, setShowCurrPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [sendingVerification, setSendingVerification] = useState(false);

  // Sync profile data (such as hasPassword) if not loaded yet
  useEffect(() => {
    if (!user?.uid) return;
    if (user.hasPassword === undefined) {
      ensureToken(user as StoredUser).then((token) => {
        if (!token) return;
        fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((d: any) => {
            if (d.success && d.user) {
              setUser({ ...user, ...d.user });
            }
          })
          .catch(() => {});
      });
    }
  }, [user?.uid]);

  const checkUsername = useCallback(async (value: string) => {
    const val = value.trim().toLowerCase();
    if (!val) { setUsernameStatus(null); return; }
    const regex = /^[a-zA-Z0-9_]+$/;
    if (!regex.test(val) || val.length < 3 || val.length > 20) {
      setUsernameStatus("invalid");
      return;
    }
    if (user?.username && val === user.username.toLowerCase()) {
      setUsernameStatus(null);
      return;
    }
    setUsernameStatus("checking");
    clearTimeout(usernameCheckRef.current);
    usernameCheckRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(val)}`);
        const data = await res.json();
        setUsernameStatus(data.available ? "available" : "taken");
      } catch {
        setUsernameStatus(null);
      }
    }, 400);
  }, [user?.username]);

  // Shelf scroll refs
  const wlScrollRef = useRef<HTMLDivElement>(null);
  const histScrollRef = useRef<HTMLDivElement>(null);

  // Read progress store for card bars
  const [progressStore, setProgressStore] = useState<Record<string, { currentTime?: number; duration?: number; pct?: number; [key: string]: unknown }>>({});
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem("sh_progress_store") || "{}");
      setProgressStore(p);
    } catch {}
  }, [history]);

  // Arrow button visibility states for horizontal shelves
  const [canScrollWlLeft, setCanScrollWlLeft] = useState(false);
  const [canScrollWlRight, setCanScrollWlRight] = useState(false);
  const [canScrollHistLeft, setCanScrollHistLeft] = useState(false);
  const [canScrollHistRight, setCanScrollHistRight] = useState(false);

  const updateShelfArrows = useCallback(() => {
    if (wlScrollRef.current) {
      const el = wlScrollRef.current;
      const canLeft = el.scrollLeft > 10;
      const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 10;
      setCanScrollWlLeft((prev) => (prev !== canLeft ? canLeft : prev));
      setCanScrollWlRight((prev) => (prev !== canRight ? canRight : prev));
    }
    if (histScrollRef.current) {
      const el = histScrollRef.current;
      const canLeft = el.scrollLeft > 10;
      const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 10;
      setCanScrollHistLeft((prev) => (prev !== canLeft ? canLeft : prev));
      setCanScrollHistRight((prev) => (prev !== canRight ? canRight : prev));
    }
  }, []);

  useEffect(() => {
    updateShelfArrows();
    window.addEventListener("resize", updateShelfArrows);
    return () => window.removeEventListener("resize", updateShelfArrows);
  }, [updateShelfArrows, watchlist, history]);

  // Shelf horizontal smooth scroll
  const scrollShelf = useCallback((ref: React.RefObject<HTMLDivElement | null>, amount: number) => {
    if (ref.current) {
      ref.current.scrollBy({ left: amount, behavior: "smooth" });
      setTimeout(updateShelfArrows, 320);
    }
  }, [updateShelfArrows]);

  // Stats calculation matching legacy calculateWatchTime()
  const totalWatchMinutes = useMemo(() => {
    let minutes = 0;
    try {
      const store = JSON.parse(localStorage.getItem("sh_progress_store") || "{}");
      for (const val of Object.values(store) as Array<{ currentTime?: number; pct?: number }>) {
        if (val && typeof val.currentTime === "number") {
          minutes += Math.round(val.currentTime / 60);
        } else if (val && typeof val.pct === "number") {
          minutes += Math.round((val.pct / 100) * 45);
        }
      }
    } catch {}
    if (minutes === 0 && history.length > 0) {
      minutes = history.length * 35;
    }
    return minutes;
  }, [history]);

  const watchTimeDisplay = useMemo(() => {
    if (totalWatchMinutes < 60) return `${totalWatchMinutes} mins`;
    let hrs = (totalWatchMinutes / 60).toFixed(1);
    if (hrs.endsWith(".0")) hrs = hrs.slice(0, -2);
    return `${hrs} ${hrs === "1" ? "hr" : "hrs"}`;
  }, [totalWatchMinutes]);

  const memberSinceDate = useMemo(() => {
    if (user && "createdAt" in user && typeof (user as { createdAt?: unknown }).createdAt === "string") {
      return new Date((user as { createdAt: string }).createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }
    return "Sep 2026";
  }, [user]);

  const switchDashboardTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (window.innerWidth <= 900) {
      setIsMobileDetail(true);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  function navigateToLibraryShelf(shelf: "watchlist" | "history") {
    switchDashboardTab("library");
    setTimeout(() => {
      const target = document.getElementById(shelf === "watchlist" ? "pf-section-watchlist" : "pf-section-history");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      updateShelfArrows();
    }, 120);
  }

  function showMobileMenu() {
    setIsMobileDetail(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleLogout() {
    openLogoutConfirm();
  }

  function clearHistoryAction() {
    setConfirmModal({
      open: true,
      title: "Clear Watch History",
      message: "Permanently remove all watched titles? This cannot be undone.",
      confirmText: "Clear History",
      onConfirm: () => {
        clearHistory();
        try {
          localStorage.removeItem("sh_progress_store");
          localStorage.removeItem("vidLinkProgress");
        } catch {}
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("playback-progress-updated"));
        }
        setConfirmModal((prev) => ({ ...prev, open: false }));
        showToast("Watch history cleared successfully", "success");
      },
    });
  }

  function clearWatchlistAction() {
    setConfirmModal({
      open: true,
      title: "Clear Watchlist",
      message: "Remove all saved titles from your watchlist? This cannot be undone.",
      confirmText: "Clear Watchlist",
      onConfirm: () => {
        clearWatchlist();
        try { localStorage.removeItem("sh_watchlist"); } catch {}
        setConfirmModal((prev) => ({ ...prev, open: false }));
        showToast("Watchlist cleared successfully", "success");
      },
    });
  }

  function deleteAccountAction() {
    setConfirmModal({
      open: true,
      title: "Delete Account",
      message: "Do you want to delete your profile? This action is permanent and will delete all your data from the server.",
      confirmText: "Delete Account",
      onConfirm: async () => {
        try {
          const token = (await ensureToken(user as StoredUser)) || user?.idToken || "";
          if (token) {
            await fetch("/api/user/profile", {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        } catch (err) {
          console.warn("[Profile] Server deletion error:", err);
        }
        logout();
        setConfirmModal((prev) => ({ ...prev, open: false }));
        setActivePage("home");
        showToast("Profile deleted successfully", "success");
      },
    });
  }

  function openAvatarModal() {
    setSelectedAvatar(user?.photoURL || "/assets/avatars/av_1.png");
    setAvatarModalOpen(true);
  }

  async function handleSaveAvatar() {
    if (!selectedAvatar) {
      showToast("Please select an avatar.", "error");
      return;
    }
    if (user) {
      const updatedUser = { ...user, photoURL: selectedAvatar };
      setUser(updatedUser);
      setAvatarModalOpen(false);
      showToast("Avatar updated successfully", "success");

      try {
        const token = (await ensureToken(user as StoredUser)) || user.idToken || "";
        const res = await fetch("/api/user/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ photoURL: selectedAvatar }),
        });
        const data = (await res.json()) as { success?: boolean; user?: Partial<StoredUser> };
        if (data.success && data.user) {
          setUser({ ...updatedUser, ...data.user });
          scheduleCloudPush();
        }
      } catch (err) {
        console.warn("[Profile] Failed to persist avatar to cloud:", err);
      }
    }
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    const sanitized = newName.trim();
    if (!sanitized) {
      showToast("Please enter a display name.", "error");
      return;
    }
    if (sanitized.length < 2) {
      showToast("Display name must be at least 2 characters.", "error");
      return;
    }
    if (sanitized.length > 50) {
      showToast("Display name cannot exceed 50 characters.", "error");
      return;
    }
    if (user) {
      const updatedUser = { ...user, displayName: sanitized };
      setUser(updatedUser);
      setNameModalOpen(false);
      showToast("Display name updated successfully", "success");

      try {
        const token = (await ensureToken(user as StoredUser)) || user.idToken || "";
        const res = await fetch("/api/user/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ displayName: sanitized }),
        });
        const data = (await res.json()) as { success?: boolean; user?: Partial<StoredUser> };
        if (data.success && data.user) {
          setUser({ ...updatedUser, ...data.user });
          scheduleCloudPush();
        }
      } catch (err) {
        console.warn("[Profile] Failed to persist display name to cloud:", err);
      }
    }
  }

  async function handleSaveUsername(e: React.FormEvent) {
    e.preventDefault();
    const sanitized = newUsername.trim().toLowerCase();
    if (!sanitized) {
      showToast("Please enter a username.", "error");
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(sanitized)) {
      showToast("Username must be 3-20 letters, numbers, or underscores.", "error");
      return;
    }
    if (user && sanitized === user.username?.toLowerCase()) {
      setUsernameModalOpen(false);
      return;
    }
    if (user) {
      try {
        const token = (await ensureToken(user as StoredUser)) || user.idToken || "";
        const res = await fetch("/api/user/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ username: sanitized }),
        });
        const data = (await res.json()) as { success?: boolean; message?: string; user?: Partial<StoredUser> };
        if (!res.ok || !data.success) {
          showToast(data.message || "Failed to update username.", "error");
          return;
        }
        setUser({ ...user, username: sanitized, ...(data.user || {}) });
        setUsernameModalOpen(false);
        showToast("Username updated successfully!", "success");
      } catch {
        showToast("Network error updating username.", "error");
      }
    }
  }

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    const trimmedNew = newEmail.trim().toLowerCase();
    if (!trimmedNew) {
      showToast("Please enter a new email address.", "error");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(trimmedNew)) {
      showToast("Please enter a valid email address.", "error");
      return;
    }
    if (user && trimmedNew === user.email.toLowerCase()) {
      showToast("New email must be different from current email.", "error");
      return;
    }
    if (user?.hasPassword !== false && !emailPass) {
      showToast("Please enter your current password to update email.", "error");
      return;
    }
    if (user) {
      try {
        const token = (await ensureToken(user as StoredUser)) || user.idToken || "";
        const res = await fetch("/api/user/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: trimmedNew,
            currentPassword: user.hasPassword !== false ? emailPass : undefined,
          }),
        });
        const data = (await res.json()) as { success?: boolean; message?: string; user?: Partial<StoredUser> };
        if (!res.ok || !data.success) {
          showToast(data.message || "Failed to update email.", "error");
          return;
        }
        setUser({ ...user, email: trimmedNew, ...(data.user || {}) });
        showToast("Email updated successfully!", "success");
        setEmailModalOpen(false);
        setCurrEmail("");
        setNewEmail("");
        setEmailPass("");
      } catch {
        showToast("Network error updating email.", "error");
      }
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (user?.hasPassword !== false && !currPassword) {
      showToast("Please enter your current password.", "error");
      return;
    }
    if (!newPassword) {
      showToast("Please enter a new password.", "error");
      return;
    }
    if (newPassword.length < 6) {
      showToast("Password must be at least 6 characters long.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }
    if (user?.hasPassword !== false && currPassword === newPassword) {
      showToast("New password must be different from current password.", "error");
      return;
    }
    if (user) {
      try {
        const token = (await ensureToken(user as StoredUser)) || user.idToken || "";
        const res = await fetch("/api/user/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword: user.hasPassword !== false ? currPassword : undefined,
            newPassword,
          }),
        });
        const data = (await res.json()) as { success?: boolean; message?: string; user?: Partial<StoredUser> };
        if (!res.ok || !data.success) {
          showToast(data.message || "Failed to update password.", "error");
          return;
        }
        setUser({ ...user, hasPassword: true, ...(data.user || {}) });
        const successMsg = user.hasPassword === false
          ? "Password set! You can now log in with either Google or email/password."
          : "Password updated successfully!";
        showToast(successMsg, "success");
        setPasswordModalOpen(false);
        setCurrPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } catch {
        showToast("Network error setting password.", "error");
      }
    }
  }


  const handleSendVerification = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const token = (await ensureToken(user as StoredUser)) || user?.idToken || "";
    if (!token) {
      showToast("Please log in again to verify your email.", "error");
      return;
    }
    setSendingVerification(true);
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ idToken: token }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Verification link sent to " + (user?.email || "your email") + "!", "success");
      } else {
        showToast(data.message || "Failed to send verification email.", "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSendingVerification(false);
    }
  };

  // 1. If Guest (not logged in)
  if (!user) {
    return (
      <div className="pf-layout" id="pf-guest">
        <div className="pf-guest-wall">
          <div className="pf-guest-icon"><i className="fas fa-user-lock" /></div>
          <h2>Sign in to view your Profile</h2>
          <p>Create a free account to save your watchlist,<br />track your watch history, and more.</p>
          <div className="pf-modal-actions" style={{ maxWidth: 360, margin: "24px auto 0", display: "flex", gap: "12px" }}>
            <a
              className="pf-btn-login"
              href="#"
              onClick={(e) => { e.preventDefault(); openAuth(); }}
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <i className="fas fa-sign-in-alt" style={{ marginRight: 8 }} />Sign In / Sign Up
            </a>
            <button
              type="button"
              className="pf-btn-secondary"
              onClick={() => setActivePage("home")}
            >
              <i className="fas fa-home" style={{ marginRight: 8 }} />Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Logged-In View
  return (
    <div className={`pf-layout${isMobileDetail ? " is-mobile-detail" : ""}`} id="pf-logged-in">
      {/* SIDEBAR */}
      <aside className="pf-sidebar">
        <a className="pf-sidebar-brand" href="#" onClick={(e) => { e.preventDefault(); setActivePage("home"); }}>
          { }
          <img src="/assets/images/logo-icon.png" alt="CineCub Icon" />
          <span>CineCub</span>
        </a>

        <div className="pf-sidebar-user">
          <div className="pf-avatar-container">
            <div className="pf-avatar" id="pf-avatar">
              { }
              <img
                src={user.photoURL || "/assets/avatars/av_1.png"}
                alt="User Avatar"
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", transform: "scale(1.04)" }}
              />
              <div className="pf-avatar-badge" style={{ display: "none" }} />
            </div>
            <div className="pf-sidebar-edit-avatar" onClick={openAvatarModal} title="Change Avatar">
              <i className="fas fa-pencil-alt" />
            </div>
          </div>
          <div className="pf-sidebar-info">
            <div className="pf-sidebar-name" id="pf-name">{user.displayName}</div>
            <div className="pf-sidebar-username" id="pf-username">{user.username || `@${user.displayName.toLowerCase().replace(/\s+/g, "")}`}</div>
          </div>
        </div>

        <nav className="pf-sidebar-nav" aria-label="Profile navigation">
          <button
            type="button"
            className={`pf-nav-item${activeTab === "overview" ? " active" : ""}`}
            data-tab="overview"
            onClick={() => switchDashboardTab("overview")}
          >
            <div className="pf-nav-icon"><i className="fas fa-chart-pie" /></div>
            <span className="pf-nav-label">Account Overview</span>
            <i className="fas fa-chevron-right pf-nav-arrow" />
          </button>
          <button
            type="button"
            className={`pf-nav-item${activeTab === "library" ? " active" : ""}`}
            data-tab="library"
            onClick={() => switchDashboardTab("library")}
          >
            <div className="pf-nav-icon"><i className="fas fa-film" /></div>
            <span className="pf-nav-label">My Library</span>
            <span className="pf-nav-badge" id="nav-badge-library">{watchlist.length + history.length}</span>
            <i className="fas fa-chevron-right pf-nav-arrow" />
          </button>
          <button
            type="button"
            className={`pf-nav-item${activeTab === "account" ? " active" : ""}`}
            data-tab="account"
            onClick={() => switchDashboardTab("account")}
          >
            <div className="pf-nav-icon"><i className="fas fa-user-shield" /></div>
            <span className="pf-nav-label">Account Information</span>
            <i className="fas fa-chevron-right pf-nav-arrow" />
          </button>
          <button
            type="button"
            className={`pf-nav-item${activeTab === "support" ? " active" : ""}`}
            data-tab="support"
            onClick={() => switchDashboardTab("support")}
          >
            <div className="pf-nav-icon"><i className="fas fa-headset" /></div>
            <span className="pf-nav-label">Community &amp; Support</span>
            <i className="fas fa-chevron-right pf-nav-arrow" />
          </button>
          <button
            type="button"
            className={`pf-nav-item nav-danger${activeTab === "actions" ? " active" : ""}`}
            data-tab="actions"
            onClick={() => switchDashboardTab("actions")}
          >
            <div className="pf-nav-icon"><i className="fas fa-shield-alt" /></div>
            <span className="pf-nav-label">Account Actions</span>
            <i className="fas fa-chevron-right pf-nav-arrow" />
          </button>
        </nav>

        <div className="pf-sidebar-actions">
          <a className="pf-sidebar-btn btn-back" href="#" onClick={(e) => { e.preventDefault(); setActivePage("home"); }}>
            <i className="fas fa-arrow-left" /> <span>Back to Home</span>
          </a>
          <button className="pf-sidebar-btn btn-logout" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt" /> <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="pf-main">
        {/* Mobile Top Navigation Bar */}
        <div className="pf-mobile-top-bar">
          <button type="button" className="pf-mobile-back-bar" onClick={showMobileMenu}>
            <i className="fas fa-chevron-left" />
            <span>Back to Profile Menu</span>
          </button>
          <button
            type="button"
            className="pf-mobile-home-btn"
            onClick={() => setActivePage("home")}
            title="Go to Home"
          >
            <i className="fas fa-home" />
          </button>
        </div>

        {/* PANE 1: ACCOUNT OVERVIEW */}
        <div className={`pf-tab-pane${activeTab === "overview" ? " active" : ""}`} id="pane-overview">
          <div className="pf-main-header">
            <div>
              <h1 className="pf-main-title"><i className="fas fa-chart-pie" style={{ color: "var(--pf-purple)" }} /> Account Overview</h1>
              <div className="pf-main-subtitle">Overview of your streaming metrics and account activity.</div>
            </div>
            <div className="pf-main-badge"><div className="pf-main-badge-dot" /> ACTIVE SESSION</div>
          </div>

          <div className="pf-stats" style={{ marginTop: 20 }}>
            <div className="pf-stat-card" onClick={() => navigateToLibraryShelf("watchlist")} style={{ cursor: "pointer" }} title="Jump to Watchlist">
              <div className="pf-stat-card-header">
                <div className="pf-stat-icon purple"><i className="fas fa-heart" /></div>
                <span className="pf-stat-badge purple">Saved</span>
              </div>
              <div className="pf-stat-card-body">
                <div className="pf-stat-val" id="stat-wl">{watchlist.length}</div>
                <div className="pf-stat-lbl">Watchlist</div>
              </div>
            </div>

            <div className="pf-stat-card" onClick={() => navigateToLibraryShelf("history")} style={{ cursor: "pointer" }} title="Jump to Watch History">
              <div className="pf-stat-card-header">
                <div className="pf-stat-icon blue"><i className="fas fa-history" /></div>
                <span className="pf-stat-badge blue">Watched</span>
              </div>
              <div className="pf-stat-card-body">
                <div className="pf-stat-val" id="stat-hist">{history.length}</div>
                <div className="pf-stat-lbl">Watched Titles</div>
              </div>
            </div>

            <div className="pf-stat-card">
              <div className="pf-stat-card-header">
                <div className="pf-stat-icon gold"><i className="fas fa-clock" /></div>
                <span className="pf-stat-badge gold">Playback</span>
              </div>
              <div className="pf-stat-card-body">
                <div className="pf-stat-val" id="stat-time">{watchTimeDisplay}</div>
                <div className="pf-stat-lbl">Watch Time</div>
              </div>
            </div>

            <div className="pf-stat-card">
              <div className="pf-stat-card-header">
                <div className="pf-stat-icon green"><i className="fas fa-calendar-check" /></div>
                <span className="pf-stat-badge green">Member</span>
              </div>
              <div className="pf-stat-card-body">
                <div className="pf-stat-val pf-stat-date" id="stat-days">{memberSinceDate}</div>
                <div className="pf-stat-lbl">Member Since</div>
              </div>
            </div>
          </div>

          {/* Overview Quick Shortcuts */}
          <div style={{ marginTop: 24, background: "var(--pf-card-bg)", border: "1px solid var(--pf-border)", borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", color: "rgba(232, 232, 240, 0.6)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <i className="fas fa-bolt" style={{ color: "#fbbf24" }} /> Quick Navigation
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <div
                onClick={() => switchDashboardTab("library")}
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "14px 16px", borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all 0.18s ease" }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(157,78,221,0.15)", color: "#c77dff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                  <i className="fas fa-film" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>My Library</div>
                  <div style={{ fontSize: 11, color: "rgba(232,232,240,0.5)" }}>Saved titles &amp; history</div>
                </div>
                <i className="fas fa-chevron-right" style={{ fontSize: 11, color: "rgba(232,232,240,0.3)" }} />
              </div>

              <div
                onClick={() => switchDashboardTab("account")}
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "14px 16px", borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all 0.18s ease" }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(58,134,255,0.15)", color: "#60a5fa", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                  <i className="fas fa-user-shield" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Account Info</div>
                  <div style={{ fontSize: 11, color: "rgba(232,232,240,0.5)" }}>Profile &amp; credentials</div>
                </div>
                <i className="fas fa-chevron-right" style={{ fontSize: 11, color: "rgba(232,232,240,0.3)" }} />
              </div>
            </div>
          </div>
        </div>

        {/* PANE 2: MY LIBRARY */}
        <div className={`pf-tab-pane${activeTab === "library" ? " active" : ""}`} id="pane-library">
          <div className="pf-main-header">
            <div>
              <h1 className="pf-main-title"><i className="fas fa-film" style={{ color: "var(--pf-purple)" }} /> My Library</h1>
              <div className="pf-main-subtitle">Browse all your saved watchlist and playback history.</div>
            </div>
          </div>

          <div className="pf-library-shelves" style={{ marginTop: 24 }}>
            {/* Shelf 1: Watchlist (Upper Section) */}
            <section className="pf-shelf-section" id="pf-section-watchlist">
              <div className="pf-shelf-header">
                <div className="pf-shelf-title-wrap">
                  <div className="pf-shelf-icon pf-shelf-icon-wl">
                    <i className="fas fa-heart" />
                  </div>
                  <div>
                    <div className="pf-shelf-title">
                      Watchlist
                      <span className="pf-shelf-badge" id="tab-wl-count">{watchlist.length}</span>
                    </div>
                    <div className="pf-shelf-sub">Saved movies &amp; shows to watch later</div>
                  </div>
                </div>

                <div className="pf-shelf-actions">
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setActivePage("watchlist"); }}
                    className="pf-shelf-view-all"
                    title="Open full dedicated Watchlist page"
                  >
                    <span>View All</span> <i className="fas fa-arrow-right" />
                  </a>
                </div>
              </div>

              {/* Left to Right Scrollable Row */}
              <div className="hscroll-wrapper pf-hscroll-container">
                <div
                  className={`hscroll-btn left${canScrollWlLeft ? " visible" : ""}`}
                  id="pf-wl-prev-btn"
                  onClick={() => scrollShelf(wlScrollRef, -600)}
                  aria-label="Scroll left"
                >
                  <i className="fas fa-chevron-left" />
                </div>
                <div className="cv-hscroll pf-lib-hscroll" id="pf-wl-grid" ref={wlScrollRef} onScroll={updateShelfArrows}>
                  {watchlist.map((item) => {
                    const itemType = item.media_type || item.type || (item.season ? "tv" : "movie");
                    const label = itemType === "tv" ? "TV SERIES" : "MOVIE";
                    const title = item.title || item.name || "Untitled";
                    const vote = item.vote_average ?? item.vote;
                    const rating = vote && Number(vote) > 0 ? Number(vote).toFixed(1) : "";
                    const poster = item.poster_path || item.poster || null;
                    const year = (item.date || item.release_date || item.first_air_date || "").slice(0, 4);

                    return (
                      <div
                        key={`wl-${item.id}-${itemType}`}
                        className="poster-card"
                        onClick={() => openDetail(item.id, itemType)}
                      >
                        <div className="poster-card-img-wrap">
                          { }
                          <img
                            className="poster-card-img"
                            src={IMG.poster(poster, "w342") || IMG.placeholder(342, 513)}
                            loading="lazy"
                            decoding="async"
                            alt={title}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = IMG.placeholder(342, 513);
                            }}
                          />
                          <div className="poster-card-grad" />
                          <div className="poster-card-top">
                            <span className="pc-badge pc-badge-quality">{label}</span>
                            {rating && <span className="pc-rating"><i className="fas fa-star" />{rating}</span>}
                          </div>
                          <div className="pc-play-wrap"><div className="pc-play-btn"><i className="fas fa-play" /></div></div>
                        </div>
                        <div className="poster-card-info">
                          <div className="pc-title" title={title}>{title}</div>
                          <div className="pc-meta">
                            <span>{year || label}</span>
                            <span className="pc-genre">{label}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  className={`hscroll-btn right${canScrollWlRight ? " visible" : ""}`}
                  id="pf-wl-next-btn"
                  onClick={() => scrollShelf(wlScrollRef, 600)}
                  aria-label="Scroll right"
                >
                  <i className="fas fa-chevron-right" />
                </div>
                {watchlist.length === 0 && (
                  <div className="pf-empty-state" id="pf-wl-empty" style={{ display: "block" }}>
                    <div className="pf-empty-icon"><i className="fas fa-heart" /></div>
                    <div className="pf-empty-title">Your Watchlist is empty</div>
                    <div className="pf-empty-sub">Explore movies &amp; shows and bookmark them to watch later.</div>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); setActivePage("home"); }}
                      className="pf-btn-secondary"
                      style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <i className="fas fa-compass" /> Discover Titles
                    </a>
                  </div>
                )}
              </div>
            </section>

            {/* Shelf 2: Watch History (Lower Section) */}
            <section className="pf-shelf-section" id="pf-section-history">
              <div className="pf-shelf-header">
                <div className="pf-shelf-title-wrap">
                  <div className="pf-shelf-icon pf-shelf-icon-hist">
                    <i className="fas fa-history" />
                  </div>
                  <div>
                    <div className="pf-shelf-title">
                      Watch History
                      <span className="pf-shelf-badge" id="tab-hist-count">{history.length}</span>
                    </div>
                    <div className="pf-shelf-sub">Recently streamed and completed titles</div>
                  </div>
                </div>

                <div className="pf-shelf-actions">
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setActivePage("history"); }}
                    className="pf-shelf-view-all"
                    title="Open full dedicated History page"
                  >
                    <span>View All</span> <i className="fas fa-arrow-right" />
                  </a>
                </div>
              </div>

              {/* Left to Right Scrollable Row */}
              <div className="hscroll-wrapper pf-hscroll-container">
                <div
                  className={`hscroll-btn left${canScrollHistLeft ? " visible" : ""}`}
                  id="pf-hist-prev-btn"
                  onClick={() => scrollShelf(histScrollRef, -600)}
                  aria-label="Scroll left"
                >
                  <i className="fas fa-chevron-left" />
                </div>
                <div className="cv-hscroll pf-lib-hscroll" id="pf-hist-grid" ref={histScrollRef} onScroll={updateShelfArrows}>
                  {history.map((item) => {
                    const itemType = item.media_type || item.type || (item.season ? "tv" : "movie");
                    const label = itemType === "tv" ? "TV SERIES" : "MOVIE";
                    const title = item.title || item.name || "Untitled";
                    const vote = item.vote_average ?? item.vote;
                    const rating = vote && Number(vote) > 0 ? Number(vote).toFixed(1) : "";
                    const poster = item.poster_path || item.poster || null;
                    const year = (item.date || item.release_date || item.first_air_date || "").slice(0, 4);

                    let pct = 0;
                    const progData = progressStore[String(item.id)] || progressStore[`${itemType}_${item.id}`];
                    if (progData && typeof progData.duration === "number" && progData.duration > 0 && typeof progData.currentTime === "number" && progData.currentTime > 0) {
                      pct = Math.min(100, Math.max(0, Math.round((progData.currentTime / progData.duration) * 100)));
                    } else if (item.progress && Number(item.progress) > 0) {
                      pct = Math.min(100, Math.max(0, Math.round(Number(item.progress))));
                    }

                    return (
                      <div
                        key={`hist-${item.id}-${itemType}`}
                        className="poster-card"
                        onClick={() => openDetail(item.id, itemType)}
                      >
                        <div className="poster-card-img-wrap">
                          { }
                          <img
                            className="poster-card-img"
                            src={IMG.poster(poster, "w342") || IMG.placeholder(342, 513)}
                            loading="lazy"
                            decoding="async"
                            alt={title}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = IMG.placeholder(342, 513);
                            }}
                          />
                          <div className="poster-card-grad" />
                          <div className="poster-card-top">
                            <span className="pc-badge pc-badge-quality">{label}</span>
                            {rating && <span className="pc-rating"><i className="fas fa-star" />{rating}</span>}
                          </div>
                          <div className="pc-play-wrap"><div className="pc-play-btn"><i className="fas fa-play" /></div></div>
                          {pct > 0 && (
                            <div className="cw-progress-overlay">
                              <div className="cw-progress-bar">
                                <div className="cw-progress-fill" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="poster-card-info">
                          <div className="pc-title" title={title}>{title}</div>
                          <div className="pc-meta">
                            <span>{year || label}</span>
                            <span className="pc-genre">{label}</span>
                            {pct > 0 && <span style={{ color: "var(--pf-purple)", fontWeight: 700 }}>{pct}%</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  className={`hscroll-btn right${canScrollHistRight ? " visible" : ""}`}
                  id="pf-hist-next-btn"
                  onClick={() => scrollShelf(histScrollRef, 600)}
                  aria-label="Scroll right"
                >
                  <i className="fas fa-chevron-right" />
                </div>
                {history.length === 0 && (
                  <div className="pf-empty-state" id="pf-hist-empty" style={{ display: "block" }}>
                    <div className="pf-empty-icon"><i className="fas fa-history" /></div>
                    <div className="pf-empty-title">No watch history yet</div>
                    <div className="pf-empty-sub">Titles you start watching will automatically appear here.</div>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); setActivePage("home"); }}
                      className="pf-btn-secondary"
                      style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <i className="fas fa-play" /> Start Watching
                    </a>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* PANE 3: ACCOUNT INFORMATION */}
        <div className={`pf-tab-pane${activeTab === "account" ? " active" : ""}`} id="pane-account">
          <div className="pf-main-header">
            <div>
              <h1 className="pf-main-title"><i className="fas fa-user-shield" style={{ color: "var(--pf-purple)" }} /> Account Information</h1>
              <div className="pf-main-subtitle">Manage your credentials, display name, and login security.</div>
            </div>
          </div>

          <div className="pf-settings-list" style={{ marginTop: 20 }}>
            <div
              className="pf-settings-row"
              onClick={() => {
                setNewUsername(user.username || "");
                setUsernameStatus(null);
                setUsernameModalOpen(true);
              }}
            >
              <div className="pf-settings-row-icon"><i className="fas fa-id-badge" /></div>
              <div className="pf-settings-row-text">
                <div className="pf-settings-row-label">Username</div>
                <div className="pf-settings-row-val" id="settings-username-sub">{user.username || user.displayName}</div>
              </div>
              <div className="pf-settings-row-arrow"><i className="fas fa-chevron-right" /></div>
            </div>
            <div className="pf-settings-row" onClick={() => { setNewName(user.displayName); setNameModalOpen(true); }}>
              <div className="pf-settings-row-icon"><i className="fas fa-user-edit" /></div>
              <div className="pf-settings-row-text">
                <div className="pf-settings-row-label">Display Name</div>
                <div className="pf-settings-row-val" id="settings-name-sub">{user.displayName}</div>
              </div>
              <div className="pf-settings-row-arrow"><i className="fas fa-chevron-right" /></div>
            </div>
            <div className="pf-settings-row" onClick={() => { setCurrEmail(user.email); setNewEmail(""); setEmailPass(""); setEmailModalOpen(true); }}>
              <div className="pf-settings-row-icon"><i className="fas fa-envelope" /></div>
              <div className="pf-settings-row-text">
                <div className="pf-settings-row-label">Email Address</div>
                <div className="pf-settings-row-val" id="settings-email-sub">{user.email || "—"}</div>
              </div>
              <div className="pf-settings-row-arrow"><i className="fas fa-chevron-right" /></div>
            </div>
            <div className="pf-settings-row static">
              <div className="pf-settings-row-icon">
                <i className={user.emailVerified ? "fas fa-check-circle" : "fas fa-shield-alt"} style={{ color: user.emailVerified ? "#10b981" : "var(--pf-purple)" }} />
              </div>
              <div className="pf-settings-row-text">
                <div className="pf-settings-row-label">Email Verification</div>
                <div className="pf-settings-row-val">
                  {user.emailVerified ? "Verified & Secure" : "Unverified • Tap to verify"}
                </div>
              </div>
              {user.emailVerified ? (
                <span className="pf-status-badge verified">
                  <i className="fas fa-check" /> Verified
                </span>
              ) : (
                <button
                  type="button"
                  className="pf-btn-verify-action"
                  onClick={handleSendVerification}
                  disabled={sendingVerification}
                >
                  {sendingVerification ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-paper-plane" />}
                  <span>{sendingVerification ? "Sending..." : "Verify"}</span>
                </button>
              )}
            </div>
            <div
              className="pf-settings-row"
              onClick={() => {
                setCurrPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setPasswordModalOpen(true);
              }}
            >
              <div className="pf-settings-row-icon"><i className="fas fa-lock" /></div>
              <div className="pf-settings-row-text">
                <div className="pf-settings-row-label">Password</div>
                <div className="pf-settings-row-val">
                  {user.hasPassword === false ? (
                    <span style={{ color: "#f59e0b", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                      <i className="fas fa-key" /> Set Password (Google Account)
                    </span>
                  ) : (
                    "••••••••"
                  )}
                </div>
              </div>
              <div className="pf-settings-row-arrow"><i className="fas fa-chevron-right" /></div>
            </div>
          </div>
        </div>

        {/* PANE 4: COMMUNITY & SUPPORT */}
        <div className={`pf-tab-pane${activeTab === "support" ? " active" : ""}`} id="pane-support">
          <div className="pf-main-header">
            <div>
              <h1 className="pf-main-title"><i className="fas fa-headset" style={{ color: "var(--pf-purple)" }} /> Community &amp; Support</h1>
              <div className="pf-main-subtitle">Join our community or reach out to our team for assistance.</div>
            </div>
          </div>

          <div className="pf-settings-list" style={{ marginTop: 20 }}>
            <a href="https://t.me/CineCub" target="_blank" rel="noopener noreferrer" className="pf-settings-row" style={{ textDecoration: "none" }}>
              <div className="pf-settings-row-icon"><i className="fab fa-telegram-plane" /></div>
              <div className="pf-settings-row-text">
                <div className="pf-settings-row-label" style={{ color: "#ffffff" }}>Telegram Channel</div>
                <div className="pf-settings-row-val">@CineCub</div>
              </div>
              <div className="pf-settings-row-arrow"><i className="fas fa-chevron-right" /></div>
            </a>
            <a href="https://www.instagram.com/cinecub.stream?stkn=NmRmd2N3NWJxMHRo" target="_blank" rel="noopener noreferrer" className="pf-settings-row" style={{ textDecoration: "none" }}>
              <div className="pf-settings-row-icon"><i className="fab fa-instagram" /></div>
              <div className="pf-settings-row-text">
                <div className="pf-settings-row-label" style={{ color: "#ffffff" }}>Instagram</div>
                <div className="pf-settings-row-val">@cinecub.stream</div>
              </div>
              <div className="pf-settings-row-arrow"><i className="fas fa-chevron-right" /></div>
            </a>
            <a href="https://x.com/CineCub26" target="_blank" rel="noopener noreferrer" className="pf-settings-row" style={{ textDecoration: "none" }}>
              <div className="pf-settings-row-icon"><i className="fa-brands fa-x-twitter" /></div>
              <div className="pf-settings-row-text">
                <div className="pf-settings-row-label" style={{ color: "#ffffff" }}>X (Twitter)</div>
                <div className="pf-settings-row-val">@CineCub26</div>
              </div>
              <div className="pf-settings-row-arrow"><i className="fas fa-chevron-right" /></div>
            </a>
            <a href="https://www.facebook.com/share/1DM4u8dtSo/" target="_blank" rel="noopener noreferrer" className="pf-settings-row" style={{ textDecoration: "none" }}>
              <div className="pf-settings-row-icon"><i className="fab fa-facebook" /></div>
              <div className="pf-settings-row-text">
                <div className="pf-settings-row-label" style={{ color: "#ffffff" }}>Facebook Page</div>
                <div className="pf-settings-row-val">CineCub Official</div>
              </div>
              <div className="pf-settings-row-arrow"><i className="fas fa-chevron-right" /></div>
            </a>
            <div onClick={() => setSupportModalOpen(true)} className="pf-settings-row" style={{ cursor: "pointer" }}>
              <div className="pf-settings-row-icon"><i className="fas fa-envelope" /></div>
              <div className="pf-settings-row-text">
                <div className="pf-settings-row-label" style={{ color: "#ffffff" }}>Contact Support</div>
                <div className="pf-settings-row-val">support@cinecub.stream</div>
              </div>
              <div className="pf-settings-row-arrow"><i className="fas fa-chevron-right" /></div>
            </div>
            <div onClick={() => openLegal("privacy")} className="pf-settings-row" style={{ cursor: "pointer" }}>
              <div className="pf-settings-row-icon"><i className="fas fa-file-contract" /></div>
              <div className="pf-settings-row-text">
                <div className="pf-settings-row-label" style={{ color: "#ffffff" }}>Privacy Policy &amp; Terms</div>
                <div className="pf-settings-row-val">Legal and DMCA information</div>
              </div>
              <div className="pf-settings-row-arrow"><i className="fas fa-chevron-right" /></div>
            </div>
          </div>
        </div>

        {/* PANE 5: ACCOUNT ACTIONS */}
        <div className={`pf-tab-pane${activeTab === "actions" ? " active" : ""}`} id="pane-actions">
          <div className="pf-main-header">
            <div>
              <h1 className="pf-main-title"><i className="fas fa-shield-alt" style={{ color: "#ff6b6b" }} /> Account Actions</h1>
              <div className="pf-main-subtitle">Danger zone settings for managing your data and account.</div>
            </div>
          </div>

          <div className="pf-settings-danger-list" style={{ marginTop: 20 }}>
            <div className="pf-settings-danger-row" onClick={clearHistoryAction}>
              <div className="pf-settings-danger-icon"><i className="fas fa-trash-alt" /></div>
              <div className="pf-settings-danger-text">
                <div className="pf-settings-danger-title">Clear Watch History</div>
                <div className="pf-settings-danger-desc">Remove all items from your watch history</div>
              </div>
              <div className="pf-settings-danger-arrow"><i className="fas fa-chevron-right" /></div>
            </div>
            <div className="pf-settings-danger-row" onClick={clearWatchlistAction}>
              <div className="pf-settings-danger-icon"><i className="fas fa-heart-broken" /></div>
              <div className="pf-settings-danger-text">
                <div className="pf-settings-danger-title">Clear Watchlist</div>
                <div className="pf-settings-danger-desc">Remove all saved items from your watchlist</div>
              </div>
              <div className="pf-settings-danger-arrow"><i className="fas fa-chevron-right" /></div>
            </div>
            <div className="pf-settings-danger-row delete-row" onClick={deleteAccountAction}>
              <div className="pf-settings-danger-icon"><i className="fas fa-user-slash" /></div>
              <div className="pf-settings-danger-text">
                <div className="pf-settings-danger-title">Delete Account</div>
                <div className="pf-settings-danger-desc">Permanently delete your account and all data</div>
              </div>
              <div className="pf-settings-danger-arrow"><i className="fas fa-chevron-right" /></div>
            </div>
          </div>
        </div>
      </main>

      {/* MODAL: AVATAR */}
      {avatarModalOpen && (
        <div className="pf-modal-overlay open" id="modal-avatar" onClick={() => setAvatarModalOpen(false)}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-title">Select Avatar</div>
            <div className="pf-avatar-grid">
              {AVATARS.map((av, idx) => {
                const isSelected = selectedAvatar === av || (!selectedAvatar && idx === 0);
                return (
                  <div
                    key={av}
                    className={`pf-avatar-option${isSelected ? " selected" : ""}`}
                    onClick={() => setSelectedAvatar(av)}
                  >
                    { }
                    <img src={`${av}?v=3`} alt={`Avatar ${idx + 1}`} />
                  </div>
                );
              })}
            </div>
            <div className="pf-modal-actions">
              <button className="pf-btn-secondary" onClick={() => setAvatarModalOpen(false)}>Cancel</button>
              <button className="pf-btn-login" onClick={handleSaveAvatar}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: USERNAME */}
      {usernameModalOpen && (
        <div className="pf-modal-overlay open" id="modal-username" onClick={() => setUsernameModalOpen(false)}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-title">Change Username</div>
            <form className="pf-modal-form" onSubmit={handleSaveUsername}>
              <div className="auth-input-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ marginBottom: 0 }}>New Username</label>
                  <span style={{ fontSize: 11, color: "var(--text-muted, #94a3b8)", fontWeight: 500 }}>
                    {newUsername.length} / 20
                  </span>
                </div>
                <input
                  type="text"
                  id="new-username-input"
                  className="auth-input"
                  placeholder="Enter new username (3-20 characters)"
                  maxLength={20}
                  autoComplete="off"
                  spellCheck="false"
                  value={newUsername}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNewUsername(v);
                    checkUsername(v);
                  }}
                />
                {usernameStatus && (
                  <div style={{ fontSize: "12px", marginTop: "6px", display: "flex", alignItems: "center", gap: "6px", color: usernameStatus === "available" ? "#06d6a0" : usernameStatus === "taken" ? "#ff4b4b" : usernameStatus === "invalid" ? "#ff4b4b" : "var(--text-4)" }}>
                    {usernameStatus === "checking" && <><i className="fas fa-circle-notch fa-spin" /> Checking availability...</>}
                    {usernameStatus === "available" && <><i className="fas fa-check-circle" /> Username is available!</>}
                    {usernameStatus === "taken" && <><i className="fas fa-times-circle" /> Username is already taken.</>}
                    {usernameStatus === "invalid" && <><i className="fas fa-times-circle" /> 3-20 alphanumeric characters or underscores.</>}
                  </div>
                )}
              </div>
              <div className="pf-modal-actions">
                <button type="button" className="pf-btn-secondary" onClick={() => setUsernameModalOpen(false)}>Cancel</button>
                <button type="submit" className="pf-btn-login" id="btn-update-username">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EMAIL */}
      {emailModalOpen && (
        <div className="pf-modal-overlay open" id="modal-email" onClick={() => setEmailModalOpen(false)}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-title">Update Email</div>
            <form className="pf-modal-form" onSubmit={handleSaveEmail}>
              <div className="auth-input-group">
                <label>Current Email</label>
                <input
                  type="email"
                  value={currEmail}
                  onChange={(e) => setCurrEmail(e.target.value)}
                  className="auth-input"
                  placeholder="Enter current email"
                  autoComplete="email"
                  spellCheck="false"
                  disabled
                  style={{ opacity: 0.7 }}
                />
              </div>
              <div className="auth-input-group">
                <label>New Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="auth-input"
                  placeholder="Enter new email address"
                  autoComplete="email"
                  spellCheck="false"
                  required
                />
              </div>
              {user.hasPassword !== false ? (
                <div className="auth-input-group">
                  <label>Current Password (required for security)</label>
                  <div className="auth-input-wrap">
                    <input
                      type={showEmailPass ? "text" : "password"}
                      value={emailPass}
                      onChange={(e) => setEmailPass(e.target.value)}
                      className="auth-input"
                      placeholder="Current password"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      aria-label="Toggle password visibility"
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowEmailPass(!showEmailPass)}
                    >
                      <i className={showEmailPass ? "fas fa-eye-slash" : "fas fa-eye"} />
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-3)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "10px 14px", borderRadius: 10, marginBottom: 16 }}>
                  <i className="fas fa-info-circle" style={{ color: "#60a5fa", marginRight: 6 }} />
                  Since you signed in with Google, no password is required to update your email.
                </div>
              )}
              <div className="pf-modal-actions">
                <button type="button" className="pf-btn-secondary" onClick={() => setEmailModalOpen(false)}>Cancel</button>
                <button type="submit" className="pf-btn-login">Update Email</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NAME */}
      {nameModalOpen && (
        <div className="pf-modal-overlay open" id="modal-name" onClick={() => setNameModalOpen(false)}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-title">Change Display Name</div>
            <form className="pf-modal-form" onSubmit={handleSaveName}>
              <div className="auth-input-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ marginBottom: 0 }}>New Display Name</label>
                  <span id="name-char-counter" style={{ fontSize: 11, color: "var(--text-muted, #94a3b8)", fontWeight: 500 }}>
                    {newName.length} / 50
                  </span>
                </div>
                <input
                  type="text"
                  id="new-display-name"
                  className="auth-input"
                  placeholder="Enter new display name"
                  maxLength={50}
                  autoComplete="username"
                  spellCheck="false"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="pf-modal-actions">
                <button type="button" className="pf-btn-secondary" onClick={() => setNameModalOpen(false)}>Cancel</button>
                <button type="submit" className="pf-btn-login" id="btn-update-name">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PASSWORD (Set or Change) */}
      {passwordModalOpen && (
        <div className="pf-modal-overlay open" id="modal-password" onClick={() => setPasswordModalOpen(false)}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-title">
              {user.hasPassword === false ? "Set Account Password" : "Change Password"}
            </div>
            {user.hasPassword === false && (
              <div style={{ fontSize: 12, color: "var(--text-3)", background: "rgba(157, 78, 221, 0.1)", border: "1px solid rgba(157, 78, 221, 0.25)", padding: "10px 14px", borderRadius: 10, marginBottom: 16 }}>
                <i className="fas fa-shield-alt" style={{ color: "#c77dff", marginRight: 6 }} />
                You signed in with Google. Setting a password allows you to log in with <strong>either Google OR your username/email + password</strong> on this exact same account!
              </div>
            )}
            <form className="pf-modal-form" onSubmit={handleSavePassword}>
              {user.hasPassword !== false && (
                <div className="auth-input-group">
                  <label>Current Password</label>
                  <div className="auth-input-wrap">
                    <input
                      type={showCurrPass ? "text" : "password"}
                      value={currPassword}
                      onChange={(e) => setCurrPassword(e.target.value)}
                      className="auth-input"
                      placeholder="Enter current password"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      aria-label="Toggle password visibility"
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowCurrPass(!showCurrPass)}
                    >
                      <i className={showCurrPass ? "fas fa-eye-slash" : "fas fa-eye"} />
                    </button>
                  </div>
                </div>
              )}
              <div className="auth-input-group">
                <label>{user.hasPassword === false ? "Create Password" : "New Password"}</label>
                <div className="auth-input-wrap">
                  <input
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="auth-input"
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    aria-label="Toggle password visibility"
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowNewPass(!showNewPass)}
                  >
                    <i className={showNewPass ? "fas fa-eye-slash" : "fas fa-eye"} />
                  </button>
                </div>
              </div>
              <div className="auth-input-group">
                <label>Confirm Password</label>
                <div className="auth-input-wrap">
                  <input
                    type={showConfirmPass ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="auth-input"
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    aria-label="Toggle password visibility"
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                  >
                    <i className={showConfirmPass ? "fas fa-eye-slash" : "fas fa-eye"} />
                  </button>
                </div>
              </div>
              <div className="pf-modal-actions">
                <button type="button" className="pf-btn-secondary" onClick={() => setPasswordModalOpen(false)}>Cancel</button>
                <button type="submit" className="pf-btn-login">
                  {user.hasPassword === false ? "Set Password" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUPPORT */}
      {supportModalOpen && (
        <div
          className="pf-modal-overlay open"
          id="modal-support"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            zIndex: 100000,
          }}
          onClick={() => setSupportModalOpen(false)}
        >
          <CustomerSupportCard onClose={() => setSupportModalOpen(false)} />
        </div>
      )}

      {/* MODAL: CONFIRM */}
      {confirmModal.open && (
        <div className="pf-modal-overlay open" id="modal-confirm" onClick={() => setConfirmModal((prev) => ({ ...prev, open: false }))}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-title" id="confirm-modal-title" style={{ color: "#ff4b4b" }}>{confirmModal.title}</div>
            <div className="pf-modal-form">
              <p id="confirm-modal-text" style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 0 }}>{confirmModal.message}</p>
            </div>
            <div className="pf-modal-actions">
              <button className="pf-btn-secondary" onClick={() => setConfirmModal((prev) => ({ ...prev, open: false }))}>Cancel</button>
              <button className="pf-btn-danger" id="confirm-modal-btn" onClick={confirmModal.onConfirm}>{confirmModal.confirmText || "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
