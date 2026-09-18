"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function GoogleCallbackPage() {
  const [status, setStatus] = useState("Connecting Google account...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unmounted = false;

    async function handleAuth() {
      try {
        const hash = window.location.hash.substring(1);
        const hashParams = new URLSearchParams(hash);
        const searchParams = new URLSearchParams(window.location.search);

        const accessToken = hashParams.get("access_token") || searchParams.get("access_token") || "";
        const idToken = hashParams.get("id_token") || searchParams.get("id_token") || "";
        const token = idToken || accessToken || hashParams.get("token") || searchParams.get("token") || "";

        if (!token) {
          setError("No authentication token received from Google. Please try again.");
          return;
        }

        // 1. If in Android environment, trigger deep link into native CineCub APK
        const isAndroid = /Android/i.test(navigator.userAgent);
        if (isAndroid) {
          const deepLink = `cinecub://auth?token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(
            accessToken
          )}&id_token=${encodeURIComponent(idToken)}`;
          const iframe = document.createElement("iframe");
          iframe.style.display = "none";
          iframe.src = deepLink;
          document.body.appendChild(iframe);
          setTimeout(() => iframe.remove(), 1500);
        }

        // 2. Authenticate directly with CineCub edge worker
        setStatus("Verifying Google credentials with CineCub...");
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, accessToken, idToken }),
        });

        const data = (await res.json().catch(() => ({}))) as Record<string, any>;

        if (unmounted) return;

        if (!res.ok || !data.success || !data.user) {
          setError(data.message || data.error || "Failed to authenticate with Google. Please try again.");
          return;
        }

        // 3. Persist session to localStorage so the user is instantly logged in on web/WebView
        try {
          localStorage.setItem("sh_user", JSON.stringify(data.user));
          localStorage.setItem("cachedAvatar", JSON.stringify(data.user.photoURL || "/assets/avatars/av_1.png"));
          localStorage.setItem("cachedName", JSON.stringify(data.user.displayName || data.user.email.split("@")[0]));
          if (data.user.username) {
            localStorage.setItem("cachedUsername", JSON.stringify(data.user.username));
          }
          let lastUid = "";
          try {
            lastUid = JSON.parse(localStorage.getItem("sh_last_synced_uid") || '""');
          } catch {}
          if (data.isNewUser || (lastUid && lastUid !== data.user.uid)) {
            localStorage.removeItem("sh_watchlist");
            localStorage.removeItem("sh_history");
            localStorage.removeItem("sh_progress_store");
            localStorage.removeItem("sh_watchlist_store");
            localStorage.removeItem("vidLinkProgress");
            localStorage.setItem("sh_last_synced_uid", JSON.stringify(data.user.uid));
            localStorage.setItem("sh_last_synced_at", JSON.stringify(Date.now()));
          }
        } catch (storageErr) {
          console.warn("[Google Callback] Local storage write warning:", storageErr);
        }

        const greetingName = data.user.displayName || data.user.username || "Movie Fan";
        setStatus(data.isNewUser ? `Welcome to CineCub, ${greetingName}! Redirecting...` : `Welcome back, ${greetingName}! Redirecting...`);

        // 4. Redirect home cleanly
        setTimeout(() => {
          window.location.href = "/";
        }, 800);
      } catch (err: any) {
        if (!unmounted) {
          setError(err?.message || "An unexpected network error occurred. Please try again.");
        }
      }
    }

    handleAuth();

    return () => {
      unmounted = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#07050A",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "20px",
      }}
    >
      <div
        style={{
          textAlign: "center",
          maxWidth: "420px",
          width: "100%",
          padding: "36px 28px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "20px",
          boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: "42px", marginBottom: "16px" }}>🐻</div>
        <h2 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "8px" }}>
          {error ? "Sign-In Issue" : "CineCub Authentication"}
        </h2>
        <p
          style={{
            fontSize: "14px",
            color: error ? "#f87171" : "#9ca3af",
            lineHeight: "1.5",
            marginBottom: error ? "20px" : "0",
          }}
        >
          {error || status}
        </p>
        {error && (
          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "10px 22px",
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              color: "#ffffff",
              borderRadius: "10px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: "600",
              marginTop: "8px",
            }}
          >
            Return to CineCub
          </Link>
        )}
      </div>
    </div>
  );
}
