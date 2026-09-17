"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { showToast } from "@/components/Toast";
import { BrandLogo } from "@/components/BrandLogo";

type AuthView = "login" | "signup" | "forgot";

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Weak", color: "#e63946" };
  if (score <= 2) return { score, label: "Fair", color: "#fb8500" };
  if (score <= 3) return { score, label: "Good", color: "#ffb703" };
  if (score <= 4) return { score, label: "Strong", color: "#06d6a0" };
  return { score, label: "Very Strong", color: "#06d6a0" };
}

function PasswordToggle({ targetId }: { targetId: string }) {
  const [visible, setVisible] = useState(false);

  const toggle = useCallback(() => {
    setVisible((v) => !v);
  }, []);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el && el.tagName === "INPUT") {
      (el as HTMLInputElement).type = visible ? "text" : "password";
    }
  }, [visible, targetId]);

  return (
    <button
      aria-label="Toggle password visibility"
      type="button"
      className="auth-password-toggle"
      onClick={toggle}
      onMouseDown={(e) => e.preventDefault()}
    >
      <i className={`fas fa-eye${visible ? "-slash" : ""}`} />
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg className="auth-google-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

const DEFAULT_GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "307176410598-7mlt6jtv723i2ki6eri6iu9cjqtp1r1v.apps.googleusercontent.com";

export default function AuthModal() {
  const { authModal, closeAuth, setUser } = useStore((s) => s);
  const [view, setView] = useState<AuthView>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");

  const [signupName, setSignupName] = useState("");
  const [signupUser, setSignupUser] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPass, setSignupPass] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [usernameStatus, setUsernameStatus] = useState<"checking" | "available" | "taken" | "invalid" | null>(null);
  const usernameCheckRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [googleClientId, setGoogleClientId] = useState(DEFAULT_GOOGLE_CLIENT_ID);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => {
        if (d?.googleClientId) setGoogleClientId(d.googleClientId);
      })
      .catch(() => {});
  }, []);

  const switchView = useCallback((v: AuthView) => {
    setView(v);
    setError("");
    setSuccess("");
    setUsernameStatus(null);
    setResendCountdown(0);
  }, []);

  const checkUsername = useCallback(async (value: string) => {
    const val = value.trim();
    if (!val) { setUsernameStatus(null); return; }
    const regex = /^[a-zA-Z0-9_]+$/;
    if (!regex.test(val)) { setUsernameStatus("invalid"); return; }
    if (val.length < 3) { setUsernameStatus("invalid"); return; }
    if (val.length > 20) { setUsernameStatus("invalid"); return; }
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
  }, []);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  useEffect(() => {
    if (!authModal) {
      setView("login");
      setError("");
      setSuccess("");
      setLoginEmail("");
      setLoginPass("");
      setSignupName("");
      setSignupUser("");
      setSignupEmail("");
      setSignupPass("");
      setSignupConfirm("");
      setForgotEmail("");
      setForgotSent(false);
    }
  }, [authModal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = document.getElementById("google-gsi-client");
    if (!existing) {
      const script = document.createElement("script");
      script.id = "google-gsi-client";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (!authModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAuth();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [authModal, closeAuth]);

  const handleGoogleAuth = useCallback(async () => {
    setError("");
    setSuccess("");
    setLoading(true);

    const effectiveClientId = googleClientId || DEFAULT_GOOGLE_CLIENT_ID;

    if (!effectiveClientId) {
      setError(
        "Google Sign-In is awaiting Client ID configuration. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID in your Cloudflare environment."
      );
      setLoading(false);
      return;
    }

    let g = typeof window !== "undefined" ? (window as any).google : null;
    if (!g?.accounts?.oauth2) {
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 100));
        g = typeof window !== "undefined" ? (window as any).google : null;
        if (g?.accounts?.oauth2) break;
      }
    }

    if (!g?.accounts?.oauth2) {
      setError("Google authentication service is initializing. Please try again in a moment.");
      setLoading(false);
      return;
    }

    try {
      const tokenClient = g.accounts.oauth2.initTokenClient({
        client_id: effectiveClientId,
        scope: "email profile openid",
        error_callback: (err: any) => {
          setLoading(false);
          if (err?.type === "popup_closed") return;
          setError(err?.message || "Google sign-in popup was closed or blocked.");
        },
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            setError(tokenResponse.error_description || "Google sign-in was cancelled.");
            setLoading(false);
            return;
          }

          try {
            const res = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accessToken: tokenResponse.access_token }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
              setError(data.message || data.error || "Google sign-in failed.");
              setLoading(false);
              return;
            }

            if (data.user) {
              const avatar = data.user.photoURL || "/assets/avatars/av_1.png";
              setUser({
                uid: data.user.uid,
                email: data.user.email,
                displayName: data.user.displayName || data.user.email.split("@")[0],
                photoURL: avatar,
                username: data.user.username,
                hasPassword: data.user.hasPassword,
                idToken: data.user.idToken,
                refreshToken: data.user.refreshToken,
              });
            }

            setSuccess("Signed in with Google! Redirecting...");
            showToast("Signed in with Google!", "success");
            setTimeout(() => {
              closeAuth();
              setLoading(false);
            }, 1000);
          } catch {
            setError("Network error communicating with CineCub servers.");
            setLoading(false);
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: "select_account" });
    } catch (err: any) {
      setError(err?.message || "Failed to initialize Google Sign-in.");
      setLoading(false);
    }
  }, [closeAuth, setUser, googleClientId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || data.error || "Login failed. Please try again.");
        setLoading(false);
        return;
      }
      if (data.user) {
        const avatar = data.user.photoURL || "/assets/avatars/av_1.png";
        setUser({
          uid: data.user.uid,
          email: data.user.email,
          displayName: data.user.displayName || data.user.email.split("@")[0],
          photoURL: avatar,
          username: data.user.username,
          hasPassword: data.user.hasPassword ?? true,
          idToken: data.user.idToken,
          refreshToken: data.user.refreshToken,
        });
      }
      setSuccess("Login successful! Redirecting...");
      showToast("Logged in successfully!", "success");
      setTimeout(() => {
        closeAuth();
        setLoading(false);
      }, 1200);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (signupPass !== signupConfirm) {
      setError("Passwords do not match.");
      return;
    }
    if (signupPass.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: signupName,
          username: signupUser,
          email: signupEmail,
          password: signupPass,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || data.error || "Signup failed. Please try again.");
        setLoading(false);
        return;
      }
      if (data.user) {
        const avatar = data.user.photoURL || "/assets/avatars/av_1.png";
        setUser({
          uid: data.user.uid,
          email: data.user.email,
          displayName: data.user.displayName || signupName,
          photoURL: avatar,
          username: signupUser,
          hasPassword: true,
          idToken: data.user.idToken,
          refreshToken: data.user.refreshToken,
        });
      }
      setSuccess("Account created! Redirecting...");
      if (data.verificationEmailSent) {
        showToast("Account created! Verification link sent to your email.", "success");
      } else {
        showToast("Account created! Welcome, " + signupUser + "!", "success");
      }
      setTimeout(() => {
        closeAuth();
        setLoading(false);
      }, 1400);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || data.error || "Failed to send reset email.");
        return;
      }
      setForgotSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const strength = getPasswordStrength(signupPass);

  if (!authModal) return null;

  return (
    <div className="modal-overlay open" id="auth-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeAuth(); }}>
      <div className="auth-modal" id="auth-modal">
        <button aria-label="Close auth modal" className="auth-close" onClick={closeAuth}>
          <i className="fas fa-times" />
        </button>

        {/* LOGIN VIEW */}
        {view === "login" && (
          <div>
            <div className="auth-header" style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", marginBottom: "16px" }}>
              <BrandLogo mascotSize={64} className="auth-brand-lockup" />
            </div>
            <div className="auth-subtitle">WELCOME BACK</div>
            <h2 className="auth-heading">Sign in</h2>
            <p className="auth-desc">Use your username or registered email address with your password.</p>

            {error && <div className="auth-error" id="auth-login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            {success && <div className="auth-success" style={{ marginBottom: "14px" }}>{success}</div>}

            <button
              type="button"
              className="auth-btn-google"
              id="btn-google-login"
              onClick={handleGoogleAuth}
              disabled={loading}
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            <div className="auth-divider">
              <span>OR CONTINUE WITH CREDENTIALS</span>
            </div>

            <form onSubmit={handleLogin} className="auth-form">
              <div className="auth-field">
                <label>Username or email</label>
                <div className="auth-input-wrap">
                  <input
                    type="text"
                    required
                    placeholder="Enter username or email"
                    autoComplete="username"

                    spellCheck={false}
                    id="login-email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                  <i className="fas fa-user input-icon" />
                </div>
              </div>
              <div className="auth-field">
                <label>Password</label>
                <div className="auth-input-wrap">
                  <input
                    type="password"
                    required
                    placeholder="Enter password"
                    autoComplete="current-password"
                    id="login-pass"
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                  />
                  <i className="fas fa-lock input-icon" />
                  <PasswordToggle targetId="login-pass" />
                </div>
              </div>
              <div className="auth-forgot-row">
                <a href="#" className="auth-forgot" onClick={(e) => { e.preventDefault(); switchView("forgot"); }}>
                  Forgot password?
                </a>
              </div>
              <button type="submit" className="auth-btn-primary" id="btn-login" disabled={loading}>
                {loading ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-sign-in-alt" />} {loading ? "Signing in..." : "Login"}
              </button>
            </form>
            <div className="auth-switch">
              Don&apos;t have an account? <span onClick={() => switchView("signup")}>Sign Up</span>
            </div>
          </div>
        )}

        {/* SIGNUP VIEW */}
        {view === "signup" && (
          <div>
            <div className="auth-header" style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", marginBottom: "16px" }}>
              <BrandLogo mascotSize={64} className="auth-brand-lockup" />
            </div>
            <div className="auth-subtitle">CREATE ACCOUNT</div>
            <h2 className="auth-heading">Join CineCub</h2>
            <p className="auth-desc">Create an account. Your username and email must be unique.</p>

            {error && <div className="auth-error" id="auth-signup-error" style={{ marginBottom: "14px" }}>{error}</div>}
            {success && <div className="auth-success" style={{ marginBottom: "14px" }}>{success}</div>}

            <button
              type="button"
              className="auth-btn-google"
              id="btn-google-signup"
              onClick={handleGoogleAuth}
              disabled={loading}
            >
              <GoogleIcon />
              <span>Sign up with Google</span>
            </button>

            <div className="auth-divider">
              <span>OR REGISTER WITH EMAIL</span>
            </div>

            <form onSubmit={handleSignup} className="auth-form">
              <div className="auth-field">
                <label>Name</label>
                <div className="auth-input-wrap">
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    autoComplete="name"

                    spellCheck={false}
                    id="signup-name"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                  />
                  <i className="fas fa-id-card input-icon" />
                </div>
              </div>
              <div className="auth-field">
                <label>Username</label>
                <div className="auth-input-wrap">
                  <input
                    type="text"
                    required
                    placeholder="e.g. johndoe"
                    autoComplete="off"

                    spellCheck={false}
                    id="signup-user"
                    value={signupUser}
                    onChange={(e) => { setSignupUser(e.target.value); checkUsername(e.target.value); }}
                  />
                  <i className="fas fa-at input-icon" />
                </div>
                {usernameStatus && (
                  <div id="username-feedback" style={{ fontSize: "12px", marginTop: "6px", display: "flex", alignItems: "center", gap: "6px", color: usernameStatus === "available" ? "#06d6a0" : usernameStatus === "taken" ? "#ff4b4b" : usernameStatus === "invalid" ? "#ff4b4b" : "var(--text-4)" }}>
                    {usernameStatus === "checking" && <><i className="fas fa-circle-notch fa-spin" /> Checking...</>}
                    {usernameStatus === "available" && <><i className="fas fa-check-circle" /> Username is available!</>}
                    {usernameStatus === "taken" && <><i className="fas fa-times-circle" /> Username is already taken.</>}
                    {usernameStatus === "invalid" && <><i className="fas fa-times-circle" /> Only letters, numbers, underscores. 3-20 chars.</>}
                  </div>
                )}
              </div>
              <div className="auth-field">
                <label>Email address</label>
                <div className="auth-input-wrap">
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    autoComplete="email"

                    spellCheck={false}
                    id="signup-email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                  />
                  <i className="fas fa-envelope input-icon" />
                </div>
              </div>
              <div className="auth-field">
                <label>Password</label>
                <div className="auth-input-wrap">
                  <input
                    type="password"
                    required
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    id="signup-pass"
                    value={signupPass}
                    onChange={(e) => setSignupPass(e.target.value)}
                  />
                  <i className="fas fa-lock input-icon" />
                  <PasswordToggle targetId="signup-pass" />
                </div>
                {signupPass.length > 0 && (
                  <div className="password-meter" id="signup-password-meter">
                    <div className="password-meter-track">
                      <div
                        className="password-meter-fill"
                        style={{
                          width: `${(strength.score / 5) * 100}%`,
                          backgroundColor: strength.color,
                        }}
                      />
                    </div>
                    <div className="password-meter-caption">
                      Security: <span className="password-meter-text" style={{ color: strength.color }}>{strength.label}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="auth-field">
                <label>Confirm password</label>
                <div className="auth-input-wrap">
                  <input
                    type="password"
                    required
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    id="signup-confirm"
                    value={signupConfirm}
                    onChange={(e) => setSignupConfirm(e.target.value)}
                  />
                  <i className="fas fa-lock input-icon" />
                  <PasswordToggle targetId="signup-confirm" />
                </div>
              </div>
              <button type="submit" className="auth-btn-primary" id="btn-signup" disabled={loading} style={{ marginTop: "20px" }}>
                {loading ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-user-plus" />} {loading ? "Creating..." : "Create Account"}
              </button>
            </form>
            <div className="auth-switch">
              Already have an account? <span onClick={() => switchView("login")}>Login</span>
            </div>
          </div>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {view === "forgot" && (
          <div>
            {!forgotSent ? (
              <div>
                <div className="auth-header" style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", marginBottom: "16px" }}>
                  <BrandLogo mascotSize={64} className="auth-brand-lockup" />
                </div>
                <div className="auth-subtitle">RECOVERY</div>
                <h2 className="auth-heading">Reset Password</h2>
                <p className="auth-desc">Enter your email address and we&apos;ll send you a secure link to reset your password.</p>

                <form onSubmit={handleForgot} className="auth-form">
                  {error && <div className="auth-error" id="auth-forgot-error">{error}</div>}
                  <div className="auth-field">
                    <label>Email address</label>
                    <div className="auth-input-wrap">
                      <input
                        type="email"
                        required
                        placeholder="you@example.com"
                        autoComplete="email"
    
                        spellCheck={false}
                        id="forgot-email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                      />
                      <i className="fas fa-envelope input-icon" />
                    </div>
                  </div>
                  <button type="submit" className="auth-btn-primary" id="btn-forgot" disabled={loading} style={{ marginTop: "10px" }}>
                    {loading ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-paper-plane" />} {loading ? "Sending..." : "Send Reset Link"}
                  </button>
                  <div style={{ marginTop: "14px", fontSize: "13px", color: "rgba(232,232,240,0.6)", textAlign: "center" }}>
                    <i className="fas fa-exclamation-triangle" style={{ color: "#ffb703" }} /> Caution: If not found in primary, please check spam.
                  </div>
                </form>
                <div className="auth-switch">
                  Remember your password? <span onClick={() => switchView("login")}>Back to Login</span>
                </div>
              </div>
            ) : (
              <div className="auth-sent-container">
                <div className="auth-header" style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", marginBottom: "16px" }}>
                  <BrandLogo mascotSize={56} className="auth-brand-lockup" />
                </div>
                <div className="auth-sent-icon-wrap">
                  <svg className="main-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                  <div className="auth-sent-check-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                </div>

                <div className="auth-subtitle">RECOVERY LINK SENT</div>
                <h2 className="auth-heading" style={{ fontSize: "26px", marginBottom: "8px" }}>Check your inbox</h2>
                <p className="auth-desc" style={{ marginBottom: "10px" }}>We sent password reset instructions to:</p>

                <div className="auth-email-badge">
                  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: "15px", height: "15px", color: "#c77dff", flexShrink: 0 }}><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                  <span id="forgot-sent-email-display">{forgotEmail}</span>
                </div>

                <div className="auth-tips-box">
                  <div className="auth-tips-item info">
                    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: "15px", height: "15px", marginTop: "1px", flexShrink: 0 }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-4h-2V7h2v2z"/></svg>
                    <span>Click the link inside the email to set a new password.</span>
                  </div>
                  <div className="auth-tips-item warning">
                    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: "15px", height: "15px", flexShrink: 0 }}><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
                    <span>Can&apos;t find it? Please check your <strong>Spam or Junk</strong> folder.</span>
                  </div>
                </div>

                <button type="button" className="auth-btn-primary" id="btn-resend-forgot" onClick={() => { setForgotSent(false); setError(""); setResendCountdown(60); }} style={{ background: "var(--cv-dark-4)", border: "1px solid var(--b-2)" }}>
                  <i className="fas fa-redo" /> <span id="btn-resend-text">{resendCountdown > 0 ? <><span id="resend-countdown">Resend in {resendCountdown}s</span></> : "Send another email"}</span>
                </button>
                {(() => {
                  const lower = forgotEmail.toLowerCase();
                  let emailUrl = `mailto:${encodeURIComponent(forgotEmail)}`;
                  let emailLabel = "Open Email App";
                  if (lower.endsWith("@gmail.com") || lower.endsWith("@googlemail.com")) { emailUrl = "https://mail.google.com"; emailLabel = "Open Gmail"; }
                  else if (lower.includes("@outlook.") || lower.includes("@hotmail.") || lower.includes("@live.")) { emailUrl = "https://outlook.live.com"; emailLabel = "Open Outlook"; }
                  else if (lower.includes("@yahoo.") || lower.includes("@ymail.")) { emailUrl = "https://mail.yahoo.com"; emailLabel = "Open Yahoo Mail"; }
                  else if (lower.includes("@icloud.") || lower.includes("@me.") || lower.includes("@mac.")) { emailUrl = "https://www.icloud.com/mail"; emailLabel = "Open iCloud Mail"; }
                  else if (lower.includes("@proton.") || lower.includes("@protonmail.")) { emailUrl = "https://mail.proton.me"; emailLabel = "Open Proton Mail"; }
                  return (
                    <a href={emailUrl} target="_blank" rel="noopener noreferrer" className="auth-btn-primary" style={{ marginTop: "10px", background: "var(--cv-dark-4)", border: "1px solid var(--b-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", textDecoration: "none" }} id="btn-open-email-provider">
                      <i className="fas fa-envelope-open" /> <span id="btn-provider-label">{emailLabel}</span>
                    </a>
                  );
                })()}
                <div style={{ marginTop: "14px", textAlign: "center" }}>
                  <a href="#" className="auth-forgot" onClick={(e) => { e.preventDefault(); switchView("forgot"); }}>Entered wrong email? Change email</a>
                </div>
                <div style={{ marginTop: "8px", textAlign: "center" }}>
                  <a href="#" className="auth-forgot" onClick={(e) => { e.preventDefault(); switchView("login"); }}>Back to Login</a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
