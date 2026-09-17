"use client";

import { useEffect, useState } from "react";

export default function GoogleCallbackPage() {
  const [status, setStatus] = useState("Connecting Google account...");

  useEffect(() => {
    try {
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const searchParams = new URLSearchParams(window.location.search);

      const accessToken = hashParams.get("access_token") || searchParams.get("access_token");
      const idToken = hashParams.get("id_token") || searchParams.get("id_token");
      const token = idToken || accessToken;

      if (token) {
        // 1. Attempt deep link into native Android app
        const deepLink = `cinecub://auth?token=${encodeURIComponent(token)}`;
        window.location.href = deepLink;

        // 2. If opened in regular browser or deep link not handled, authenticate directly in web
        setTimeout(async () => {
          try {
            const res = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(idToken ? { idToken } : { accessToken }),
            });
            if (res.ok) {
              window.location.href = "/";
            } else {
              setStatus("Sign-in completed. Please return to CineCub.");
            }
          } catch {
            window.location.href = "/";
          }
        }, 1200);
      } else {
        setStatus("No authentication credentials found. Redirecting to home...");
        setTimeout(() => {
          window.location.href = "/";
        }, 1500);
      }
    } catch {
      window.location.href = "/";
    }
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
          maxWidth: "400px",
          padding: "32px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "16px" }}>🐻</div>
        <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "8px" }}>CineCub Sign-In</h2>
        <p style={{ fontSize: "14px", color: "#9ca3af", lineHeight: "1.5" }}>{status}</p>
      </div>
    </div>
  );
}
