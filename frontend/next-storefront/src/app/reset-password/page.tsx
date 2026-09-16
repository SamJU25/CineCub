"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";

function getPasswordStrength(pass: string): { score: number; label: string; color: string } {
  if (!pass) return { score: 0, label: "", color: "#334155" };
  let score = 0;
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;

  if (score <= 1) return { score: 1, label: "Weak", color: "#ef4444" };
  if (score === 2) return { score: 2, label: "Fair", color: "#f59e0b" };
  if (score === 3) return { score: 3, label: "Good", color: "#3b82f6" };
  return { score: 4, label: "Strong", color: "#10b981" };
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const setUser = useStore((s) => s.setUser);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Reset token is missing. Please use the link sent to your email.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword: password,
          confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || data.error || "Failed to reset password.");
        setLoading(false);
        return;
      }

      if (data.user) {
        setUser(data.user);
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 2500);
    } catch {
      setError("Network connection error. Please try again.");
      setLoading(false);
    }
  };

  if (!token && !success) {
    return (
      <div style={{ maxWidth: "420px", width: "100%", margin: "0 auto", textAlign: "center" }}>
        <div
          style={{
            background: "rgba(19, 23, 34, 0.85)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "16px",
            padding: "36px 28px",
            backdropFilter: "blur(16px)",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              color: "#ef4444",
              fontSize: "24px",
            }}
          >
            <i className="fas fa-exclamation-triangle" />
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#f8fafc", margin: "0 0 10px" }}>
            Invalid Reset Link
          </h2>
          <p style={{ fontSize: "14px", color: "#94a3b8", lineHeight: "22px", margin: "0 0 24px" }}>
            This password reset link is missing a security token. Please request a new link from the login modal.
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
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "420px", width: "100%", margin: "0 auto" }}>
      <div
        style={{
          background: "rgba(19, 23, 34, 0.85)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          padding: "36px 32px",
          backdropFilter: "blur(16px)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Link href="/" style={{ display: "inline-block", marginBottom: "16px" }}>
            <img
              src="/assets/images/web-logo.png"
              alt="CineCub"
              style={{ height: "40px", width: "auto", objectFit: "contain" }}
            />
          </Link>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f8fafc", margin: "0 0 8px" }}>
            Reset Your Password
          </h1>
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
            {email ? `For account: ${email}` : "Choose a new, secure password for your account."}
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              borderRadius: "10px",
              padding: "12px 14px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "20px",
            }}
          >
            <i className="fas fa-exclamation-circle" style={{ color: "#ef4444" }} />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                color: "#10b981",
                fontSize: "28px",
              }}
            >
              <i className="fas fa-check" />
            </div>
            <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#f8fafc", margin: "0 0 8px" }}>
              Password Updated!
            </h3>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 20px" }}>
              Your password has been changed and your account is verified. Redirecting you to CineCub...
            </p>
            <div
              style={{
                display: "inline-block",
                width: "24px",
                height: "24px",
                border: "2px solid rgba(255, 255, 255, 0.1)",
                borderTopColor: "#38bdf8",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* New Password */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#cbd5e1",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                New Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "rgba(15, 18, 26, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "10px",
                    padding: "12px 42px 12px 14px",
                    color: "#fff",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                >
                  <i className={`fas ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
                </button>
              </div>

              {/* Password strength meter */}
              {password && (
                <div style={{ marginTop: "8px" }}>
                  <div style={{ display: "flex", gap: "4px", height: "4px" }}>
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        style={{
                          flex: 1,
                          borderRadius: "2px",
                          background: step <= strength.score ? strength.color : "rgba(255, 255, 255, 0.1)",
                          transition: "background 0.3s ease",
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontSize: "11px" }}>
                    <span style={{ color: "#64748b" }}>Strength:</span>
                    <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#cbd5e1",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Confirm Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "rgba(15, 18, 26, 0.8)",
                  border: `1px solid ${
                    confirmPassword && confirmPassword !== password
                      ? "rgba(239, 68, 68, 0.5)"
                      : "rgba(255, 255, 255, 0.1)"
                  }`,
                  borderRadius: "10px",
                  padding: "12px 14px",
                  color: "#fff",
                  fontSize: "14px",
                  outline: "none",
                }}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                padding: "14px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                boxShadow: "0 4px 20px rgba(37, 99, 235, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginTop: "6px",
              }}
            >
              {loading ? (
                <>
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-lock" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </form>
        )}

        <div style={{ textAlign: "center", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <Link
            href="/"
            style={{
              fontSize: "13px",
              color: "#94a3b8",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <i className="fas fa-arrow-left" style={{ fontSize: "11px" }} />
            <span>Back to CineCub Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 50% 20%, rgba(2, 132, 199, 0.12) 0%, #0b0d14 70%)",
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
            Loading CineCub secure reset portal...
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
