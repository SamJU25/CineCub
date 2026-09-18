"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { showToast } from "@/components/Toast";

export default function LogoutConfirmModal() {
  const { logoutConfirmOpen, closeLogoutConfirm, logout, user, activePage, setActivePage } = useStore(
    useShallow((s) => ({
      logoutConfirmOpen: s.logoutConfirmOpen,
      closeLogoutConfirm: s.closeLogoutConfirm,
      logout: s.logout,
      user: s.user,
      activePage: s.activePage,
      setActivePage: s.setActivePage,
    }))
  );

  useEffect(() => {
    if (!logoutConfirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLogoutConfirm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [logoutConfirmOpen, closeLogoutConfirm]);

  if (!logoutConfirmOpen) return null;

  const photoURL = user?.photoURL || "/assets/avatars/av_1.png";
  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";

  const handleConfirm = () => {
    logout();
    closeLogoutConfirm();
    if (activePage === "profile") {
      setActivePage("home");
    }
    showToast("Logged out successfully.", "info");
  };

  return (
    <div
      className="modal-overlay open"
      id="logout-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 1,
        visibility: "visible",
        pointerEvents: "auto",
        padding: "20px",
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeLogoutConfirm();
      }}
    >
      <div
        className="logout-modal-card"
        style={{
          background: "#101018",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "20px",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.75)",
          width: "90%",
          maxWidth: "380px",
          textAlign: "center",
          padding: "32px 24px",
          fontFamily: "inherit",
          boxSizing: "border-box",
          animation: "authModalPop 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photoURL}
          alt={displayName}
          style={{
            width: "72px",
            height: "72px",
            objectFit: "cover",
            borderRadius: "50%",
            margin: "0 auto 12px auto",
            display: "block",
            border: "2px solid rgba(255, 255, 255, 0.2)",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.5)",
          }}
        />
        <div style={{ color: "#ffffff", fontSize: "17px", fontWeight: 800, marginBottom: "18px" }}>
          {displayName}
        </div>

        <h3 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px", color: "#fff" }}>
          Confirm Logout
        </h3>
        <p style={{ color: "rgba(232, 232, 240, 0.65)", fontSize: "14px", marginBottom: "24px", lineHeight: 1.5 }}>
          Are you sure you want to log out of CineCub?
        </p>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button
            id="btn-cancel-logout"
            type="button"
            onClick={closeLogoutConfirm}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              color: "#e8e8f0",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "13px 20px",
              borderRadius: "12px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "background 0.18s, transform 0.15s",
              flex: 1,
              fontFamily: "inherit",
              fontSize: "14px",
            }}
          >
            Cancel
          </button>
          <button
            id="btn-confirm-logout"
            type="button"
            onClick={handleConfirm}
            style={{
              background: "rgba(255, 75, 75, 0.14)",
              color: "#ff5c5c",
              border: "1px solid rgba(255, 75, 75, 0.3)",
              padding: "13px 20px",
              borderRadius: "12px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "background 0.18s, transform 0.15s",
              flex: 1,
              fontFamily: "inherit",
              fontSize: "14px",
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
