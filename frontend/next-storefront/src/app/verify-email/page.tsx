"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setSuccess(false);
      setMessage("Verification token is missing. Please use the link sent to your email.");
      return;
    }

    let isMounted = true;

    async function verify() {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!isMounted) return;

        if (res.ok && data.success) {
          setSuccess(true);
          setMessage(data.message || "Your email address has been verified successfully!");
          if (data.email) setVerifiedEmail(data.email);
        } else {
          setSuccess(false);
          setMessage(data.message || data.error || "This verification link is invalid or has already been used.");
        }
      } catch {
        if (!isMounted) return;
        setSuccess(false);
        setMessage("Network connection error. Please try again.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <div style={{ maxWidth: "440px", width: "100%", margin: "0 auto", textAlign: "center" }}>
      <div
        style={{
          background: "rgba(19, 23, 34, 0.85)",
          border: `1px solid ${
            loading
              ? "rgba(56, 189, 248, 0.2)"
              : success
              ? "rgba(16, 185, 129, 0.3)"
              : "rgba(239, 68, 68, 0.3)"
          }`,
          borderRadius: "16px",
          padding: "40px 32px",
          backdropFilter: "blur(16px)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
        }}
      >
        <Link href="/" style={{ display: "inline-block", marginBottom: "24px" }}>
          <img
            src="/assets/images/web-logo.png"
            alt="CineCub"
            style={{ height: "40px", width: "auto", objectFit: "contain" }}
          />
        </Link>

        {loading ? (
          <div style={{ padding: "20px 0" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "3px solid rgba(56, 189, 248, 0.15)",
                borderTopColor: "#38bdf8",
                borderRadius: "50%",
                margin: "0 auto 20px",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#f8fafc", margin: "0 0 8px" }}>
              Verifying Your Email
            </h2>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
              Checking security token with CineCub authentication...
            </p>
          </div>
        ) : success ? (
          <div>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                color: "#10b981",
                fontSize: "30px",
                boxShadow: "0 0 30px rgba(16, 185, 129, 0.2)",
              }}
            >
              <i className="fas fa-check" />
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#f8fafc", margin: "0 0 10px" }}>
              Email Verified!
            </h2>
            <p style={{ fontSize: "14px", color: "#94a3b8", lineHeight: "22px", margin: "0 0 6px" }}>
              {message}
            </p>
            {verifiedEmail && (
              <div
                style={{
                  display: "inline-block",
                  background: "rgba(255, 255, 255, 0.05)",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  color: "#cbd5e1",
                  margin: "8px 0 24px",
                }}
              >
                {verifiedEmail}
              </div>
            )}
            <div style={{ marginTop: verifiedEmail ? 0 : "24px" }}>
              <Link
                href="/"
                style={{
                  display: "inline-block",
                  background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                  color: "#fff",
                  textDecoration: "none",
                  padding: "12px 32px",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: 600,
                  boxShadow: "0 4px 15px rgba(16, 185, 129, 0.35)",
                }}
              >
                Continue to CineCub
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                color: "#ef4444",
                fontSize: "28px",
              }}
            >
              <i className="fas fa-times" />
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#f8fafc", margin: "0 0 10px" }}>
              Verification Failed
            </h2>
            <p style={{ fontSize: "14px", color: "#94a3b8", lineHeight: "22px", margin: "0 0 24px" }}>
              {message}
            </p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                color: "#fff",
                textDecoration: "none",
                padding: "12px 28px",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: 600,
                boxShadow: "0 4px 15px rgba(2, 132, 199, 0.35)",
              }}
            >
              Return to CineCub
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 50% 20%, rgba(16, 185, 129, 0.1) 0%, #0b0d14 70%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "30px 16px",
        boxSizing: "border-box",
      }}
    >
      <Suspense
        fallback={
          <div style={{ color: "#94a3b8", fontSize: "14px", textAlign: "center" }}>
            Loading CineCub verification portal...
          </div>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
