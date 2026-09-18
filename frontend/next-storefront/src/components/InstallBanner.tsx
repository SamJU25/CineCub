"use client";

import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";

/** Browser BeforeInstallPrompt event shape */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isAndroidUA = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent || "");

const BANNER_CSS = `
.install-banner-wrap {
  position: fixed;
  bottom: 16px;
  left: 16px;
  right: 16px;
  z-index: 9000;
  max-width: 480px;
  margin: 0 auto;
  background: rgba(18, 18, 28, 0.95);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(157, 78, 221, 0.35);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
  padding: 12px;
  animation: installSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.install-banner-content {
  display: flex;
  align-items: center;
  gap: 12px;
}
.install-banner-icon {
  border-radius: 10px;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
.install-banner-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.install-banner-title {
  font-size: 14px;
  font-weight: 800;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.install-banner-sub {
  font-size: 11px;
  color: #a5a6b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.install-banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.install-banner-btn-main {
  background: linear-gradient(135deg, #7b2cbf 0%, #9d4edd 100%);
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
  padding: 8px 16px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(157, 78, 221, 0.4);
  transition: transform 0.15s ease, filter 0.15s ease;
}
.install-banner-btn-main:hover {
  transform: scale(1.04);
  filter: brightness(1.1);
}
.install-banner-btn-close {
  background: rgba(255, 255, 255, 0.08);
  color: #7e8094;
  border: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s ease, color 0.15s ease;
}
.install-banner-btn-close:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}
@keyframes installSlideUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@media (max-width: 992px) {
  .install-banner-wrap {
    bottom: calc(78px + env(safe-area-inset-bottom, 0px));
  }
}
`;

export default function InstallBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  function dismiss() {
    setIsVisible(false);
    try {
      localStorage.setItem("sh_install_banner_dismissed", String(Date.now()));
    } catch { /* storage full or blocked */ }
  }

  async function handleInstall() {
    useStore.getState().openApps();
    dismiss();
  }

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    const isAppEnv = document.documentElement.classList.contains("is-app-env") ||
      Boolean(
        (window as unknown as { AndroidShare?: unknown }).AndroidShare ||
        (window as unknown as { CineCubAndroid?: unknown }).CineCubAndroid ||
        (window as unknown as { CineCubNativeApp?: unknown }).CineCubNativeApp ||
        (window as unknown as { StreamHeavenAndroid?: unknown }).StreamHeavenAndroid
      );

    if (isStandalone || isAppEnv) return;

    try {
      const dismissed = localStorage.getItem("sh_install_banner_dismissed");
      if (dismissed && Date.now() - parseInt(dismissed, 10) < 7 * 86400 * 1000) return;
    } catch { /* storage blocked */ }

    const ua = navigator.userAgent || "";
    const isMobile = /android|iphone|ipad|ipod/i.test(ua);
    if (!isMobile) return; // Desktop: never show the install/download banner

    const timer = setTimeout(() => setIsVisible(true), 2500);
    const beforeInstallHandler = (ev: Event) => {
      ev.preventDefault();
      deferredPromptRef.current = ev as BeforeInstallPromptEvent;
      setIsVisible(true);
    };
    window.addEventListener("beforeinstallprompt", beforeInstallHandler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", beforeInstallHandler);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="install-banner-wrap" role="banner" aria-label="Install App Banner">
      <style dangerouslySetInnerHTML={{ __html: BANNER_CSS }} />
      <div className="install-banner-content">
        { }
        <img
          src="/assets/images/favicon-48x48.png"
          alt="CineCub Icon"
          width={40}
          height={40}
          className="install-banner-icon"
        />
        <div className="install-banner-text">
          <span className="install-banner-title">CineCub App</span>
          <span className="install-banner-sub">Fast HD Streaming &amp; Offline Sync</span>
        </div>
        <div className="install-banner-actions">
          <button onClick={handleInstall} className="install-banner-btn-main">
            {isAndroidUA ? "Get APK" : "Install"}
          </button>
          <button onClick={dismiss} aria-label="Dismiss banner" className="install-banner-btn-close">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
