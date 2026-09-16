"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { CustomerSupportCard } from "@/components/CustomerSupportCard";

export function TrailerModal() {
  const { trailerModal, closeTrailer } = useStore((s) => s);
  if (!trailerModal) return null;

  return (
    <div className="trailer-modal-overlay open" id="trailer-modal-overlay" onClick={closeTrailer}>
      <div className="trailer-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="trailer-modal-header">
          <div className="trailer-modal-title" id="trailer-modal-title">Official Trailer</div>
          <button type="button" className="trailer-modal-close" onClick={closeTrailer} title="Close Trailer (Esc)" aria-label="Close Trailer">
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="trailer-modal-body">
          <div className="trailer-modal-frame-wrap">
            <iframe
              id="trailer-modal-iframe"
              src={`https://www.youtube.com/embed/${trailerModal.youtubeKey}?autoplay=1&rel=0`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              frameBorder="0"
              title="Trailer Player"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LegalModal() {
  const { legalModal, closeLegal } = useStore((s) => s);
  if (!legalModal) return null;

  if (legalModal.type === "contact") {
    return (
      <div
        className="legal-modal-overlay open"
        id="legal-modal-overlay"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          zIndex: 100000,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeLegal();
        }}
      >
        <CustomerSupportCard onClose={closeLegal} />
      </div>
    );
  }

  const content: Record<string, { title: string; html: string }> = {
    dmca: {
      title: "DMCA Copyright Policy",
      html: `<p>CineCub respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act (DMCA), we will respond expeditiously to claims of copyright infringement committed using our service.</p><h3>Reporting Copyright Infringement</h3><p>CineCub does not host any media files, movies, TV series, or anime on its servers or its Ad-Free servers. All contents are provided by non-affiliated third parties and fetched dynamically. If you believe that your copyrighted work is accessible on CineCub without authorization, please submit a DMCA notice including:</p><p>&bull; Identification of the copyrighted work claimed to have been infringed.<br>&bull; The exact URL or location on our site where the material is located.<br>&bull; Your contact information (Name, Email, Phone Number).<br>&bull; A statement of good faith belief that the disputed use is not authorized by the copyright owner.</p><p>Contact our DMCA agent at: <strong>support@cinecub.stream</strong></p>`,
    },
    privacy: {
      title: "Privacy Policy",
      html: `<p>Your privacy is important to CineCub. This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website or application.</p><h3>1. Information We Store</h3><p>To provide a personalized experience, we store your username, customized watchlist, and watch history (including playback progress) securely in our database and local storage. This allows you to log in, resume playback where you left off, and access your saved content across different devices. You can manage or clear your watch history and watchlist at any time in your Profile settings. We do not sell or share any of this personal data with third parties.</p><h3>2. Third-Party Services</h3><p>We utilize the TMDB API for movie, TV show, and anime metadata and imagery. Third-party video embedding providers and our Ad-Free routing servers may use standard web trackers to deliver media streams.</p>`,
    },
    terms: {
      title: "Terms of Service",
      html: `<p>Welcome to CineCub. By accessing or using our website and application, you agree to be bound by these Terms of Service.</p><h3>1. Acceptance of Terms</h3><p>You must be at least 13 years of age to use this platform. By using CineCub, you warrant that you meet this age requirement.</p><h3>2. Third-Party Content Disclaimer</h3><p>CineCub does not host, upload, or stream any video files on its servers. All videos, anime, and media content are hosted by external third-party services. We assume no responsibility or liability for the content hosted on third-party servers.</p>`,
    },
    license: {
      title: "MIT License & Open Source",
      html: `<p><strong>CineCub</strong> is open-source software released under the <strong>MIT License</strong>.</p><p style="margin-top:12px">Copyright &copy; 2026 <strong>CineCub (SamJU25)</strong></p><p style="margin-top:12px">Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the &quot;Software&quot;), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:</p><p style="margin-top:12px">The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.</p><p style="margin-top:12px;font-size:12px;color:rgba(255,255,255,0.7);line-height:1.6">THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</p>`,
    },
  };

  const c = content[legalModal.type] || content.dmca;

  return (
    <div className="legal-modal-overlay open" id="legal-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeLegal(); }}>
      <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
        <button aria-label="Close legal document" className="legal-close" onClick={closeLegal} type="button">
          <i className="fas fa-times" />
        </button>
        <div className="legal-title" id="legal-modal-title">{c.title}</div>
        <div className="legal-body" id="legal-modal-body" dangerouslySetInnerHTML={{ __html: c.html }} />
      </div>
    </div>
  );
}

export function ConfirmModal({ title, text, onConfirm, onCancel }: {
  title: string; text: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="modal-overlay open" id="confirm-modal-overlay" onClick={onCancel}>
      <div className="auth-modal" style={{ maxWidth: "400px", padding: "24px" }} onClick={(e) => e.stopPropagation()}>
        <div className="legal-title" id="confirm-modal-title" style={{ marginBottom: "12px", fontSize: "20px", fontWeight: 800, color: "var(--cv-red)" }}>{title}</div>
        <div className="legal-body" id="confirm-modal-text" style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", marginBottom: "24px" }}>{text}</div>
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "rgba(255,255,255,0.05)", color: "#fff", padding: "10px 20px", borderRadius: "var(--r-box, 12px)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", fontWeight: 600, flex: 1 }}>Cancel</button>
          <button onClick={onConfirm} style={{ background: "var(--cv-red)", color: "#fff", padding: "10px 20px", borderRadius: "var(--r-box, 12px)", border: "none", cursor: "pointer", fontWeight: 600, flex: 1 }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

export function AppsModal() {
  const { appsModal, closeApps } = useStore((s) => s);
  const [showIosStep, setShowIosStep] = useState(false);
  if (
    !appsModal ||
    (typeof document !== "undefined" &&
      document.documentElement.classList.contains("is-app-env"))
  ) {
    return null;
  }

  return (
    <div
      className="cv-modal open"
      id="apps-modal"
      style={{
        display: "flex",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        zIndex: 100000,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeApps();
      }}
    >
      <div className="cv-modal-content apps-modal-card" style={{ position: "relative", zIndex: 100001, margin: "auto" }}>
        <span className="cv-modal-close" onClick={closeApps} style={{ fontSize: "0.9rem", fontWeight: 500, top: "22px", right: "22px", position: "absolute", cursor: "pointer", color: "var(--text-3)" }}>Close</span>
        {!showIosStep ? (
          <>
            <h2 style={{ marginTop: 0, marginBottom: "20px", fontSize: "1.25rem", color: "#fff" }}>Get CineCub</h2>
            <div className="apps-btn-group">
              <a
                href="/CineCub.apk"
                download="CineCub.apk"
                className="app-btn app-btn-primary"
              >
                <div className="app-btn-icon"><i className="fab fa-android" /></div>
                <div className="app-btn-text">
                  <strong>Android APK (v1.6.0)</strong>
                  <span>For phones & tablets</span>
                </div>
                <div className="app-btn-action"><i className="fas fa-download" /></div>
              </a>
              <button className="app-btn app-btn-secondary" onClick={() => setShowIosStep(true)}>
                <div className="app-btn-icon" style={{ color: "#fff" }}><i className="fab fa-apple" /></div>
                <div className="app-btn-text">
                  <strong>Apple iOS</strong>
                  <span>For iPhone & iPad</span>
                </div>
                <div className="app-btn-action"><i className="fas fa-chevron-right" /></div>
              </button>
            </div>
          </>
        ) : (
          <div id="apps-modal-ios">
            <button className="app-back-btn" onClick={() => setShowIosStep(false)}>
              <i className="fas fa-arrow-left" /> Back
            </button>
            <h2 style={{ marginTop: 15, marginBottom: 10, fontSize: "1.25rem", color: "#fff" }}>
              <i className="fab fa-apple" /> Install on iOS
            </h2>
            <p style={{ color: "#a0a0b5", fontSize: "0.95rem", lineHeight: 1.5, marginBottom: 20 }}>
              Apple does not allow direct app downloads. Install our Progressive Web App via Safari instead.
            </p>
            <div className="ios-steps">
              <div className="ios-step">
                <div className="step-num">1</div>
                <div className="step-desc">Open this site in <strong>Safari</strong> on your iPhone.</div>
              </div>
              <div className="ios-step">
                <div className="step-num">2</div>
                <div className="step-desc">Tap the <strong>Share</strong> button <i className="fas fa-external-link-alt" style={{ margin: "0 5px", color: "#c77dff" }} /> at the bottom of the screen.</div>
              </div>
              <div className="ios-step">
                <div className="step-num">3</div>
                <div className="step-desc">Scroll down and tap <strong>Add to Home Screen</strong> <i className="fas fa-plus-square" style={{ margin: "0 5px", color: "#c77dff" }} />.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
