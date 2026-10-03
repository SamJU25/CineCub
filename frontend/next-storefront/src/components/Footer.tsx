"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";

export default function Footer() {
  const openLegal = useStore((s) => s.openLegal);
  const setActivePage = useStore((s) => s.setActivePage);
  const setBrowseCategory = useStore((s) => s.setBrowseCategory);
  const [versionName, setVersionName] = useState("1.7.1");

  useEffect(() => {
    fetch(`/version.json?t=${Date.now()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.versionName) setVersionName(d.versionName);
      })
      .catch(() => {});
  }, []);

  return (
    <footer className="cv-footer">
      <div className="cv-container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-logo" style={{ display: "flex", alignItems: "center" }}>
              <img src="/assets/images/web-logo.png" alt="CineCub" width={126} height={46} style={{ height: "46px", width: "auto", objectFit: "contain", filter: "drop-shadow(0 2px 10px rgba(157,78,221,0.35))" }} />
            </div>
            <p className="footer-desc">Your ultimate high-definition destination for movies, TV series, anime, and classics. Discover trending cinema anytime, anywhere.</p>
            <div className="footer-brand-actions">
              <a href="https://t.me/CineCub" target="_blank" rel="noopener noreferrer" className="footer-btn footer-btn-telegram" title="Join CineCub Telegram">
                <i className="fab fa-telegram-plane" /> Join Telegram
              </a>
              <button onClick={() => useStore.getState().openApps()} className="footer-btn footer-btn-app" title="Download CineCub App">
                <i className="fas fa-download" /> Get App
              </button>
            </div>
            <div className="footer-status-pill">
              <span className="footer-status-dot" aria-hidden="true" />
              <span>Streaming Clusters Operational</span>
            </div>
          </div>

          <div>
            <h3 className="footer-col-title">Navigation</h3>
            <div className="footer-links">
              <Link href="/" className="footer-link" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setActivePage("home"); }}>Home</Link>
              <Link href="/?page=browse&cat=movie" className="footer-link" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setBrowseCategory("movie"); setActivePage("browse"); }}>Movies</Link>
              <Link href="/?page=browse&cat=tv" className="footer-link" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setBrowseCategory("tv"); setActivePage("browse"); }}>TV Series</Link>
              <Link href="/?page=browse&cat=anime" className="footer-link" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setBrowseCategory("anime", 16); setActivePage("browse"); }}>Anime</Link>
            </div>
          </div>

          <div>
            <h3 className="footer-col-title">Top Genres</h3>
            <div className="footer-links">
              <Link href="/?page=browse&cat=movie&genre=28" className="footer-link" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setBrowseCategory("movie", 28); setActivePage("browse"); }}>Action</Link>
              <Link href="/?page=browse&cat=movie&genre=35" className="footer-link" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setBrowseCategory("movie", 35); setActivePage("browse"); }}>Comedy</Link>
              <Link href="/?page=browse&cat=movie&genre=27" className="footer-link" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setBrowseCategory("movie", 27); setActivePage("browse"); }}>Horror</Link>
              <Link href="/?page=browse&cat=movie&genre=878" className="footer-link" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setBrowseCategory("movie", 878); setActivePage("browse"); }}>Sci-Fi</Link>
            </div>
          </div>

          <div>
            <h3 className="footer-col-title">Legal</h3>
            <div className="footer-links">
              <Link href="/#dmca" className="footer-link" onClick={(e) => { e.preventDefault(); openLegal("dmca"); }}>DMCA Policy</Link>
              <Link href="/#privacy" className="footer-link" onClick={(e) => { e.preventDefault(); openLegal("privacy"); }}>Privacy Policy</Link>
              <Link href="/#terms" className="footer-link" onClick={(e) => { e.preventDefault(); openLegal("terms"); }}>Terms of Service</Link>
              <Link href="/#license" className="footer-link" onClick={(e) => { e.preventDefault(); openLegal("license"); }}>License</Link>
              <Link href="/#contact" className="footer-link" onClick={(e) => { e.preventDefault(); openLegal("contact"); }}>Contact</Link>
            </div>
          </div>

          <div>
            <h3 className="footer-col-title">Connect & Contact</h3>
            <div className="footer-links">
              <a href="https://t.me/CineCub" target="_blank" rel="noopener noreferrer" className="footer-link"><i className="fab fa-telegram-plane" /><span>Telegram Channel</span></a>
              <a href="https://www.facebook.com/share/1DM4u8dtSo/" target="_blank" rel="noopener noreferrer" className="footer-link"><i className="fab fa-facebook" /><span>Facebook</span></a>
              <a href="https://x.com/CineCub26" target="_blank" rel="noopener noreferrer" className="footer-link"><i className="fa-brands fa-x-twitter" /><span>X (Twitter)</span></a>
              <a href="https://www.instagram.com/cinecub.stream?stkn=NmRmd2N3NWJxMHRo" target="_blank" rel="noopener noreferrer" className="footer-link"><i className="fab fa-instagram" /><span>Instagram</span></a>
              <a href="mailto:support@cinecub.stream" className="footer-link"><i className="fas fa-envelope" /><span>support@cinecub.stream</span></a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-copy">&copy; 2026 CineCub. All rights reserved. Powered by TMDB API.</div>
          <div className="footer-disclaimer">Disclaimer: CineCub does not host any media files. All video contents are provided by non-affiliated third parties. User data is securely encrypted and stored on Cloudflare.</div>
        </div>

        <div className="app-compact-footer">
          <div className="acf-brand">
            <img src="/assets/images/icon-logo.png" alt="CineCub" className="acf-logo" />
            <div className="acf-info">
              <div className="acf-name">CineCub</div>
              <div className="acf-tagline">Unlimited Entertainment • v{versionName}</div>
            </div>
          </div>
          <div className="acf-actions">
            <a href="https://t.me/CineCub" target="_blank" rel="noopener noreferrer" className="acf-btn-telegram" title="Join CineCub Telegram">
              <i className="fab fa-telegram-plane" /> Join Telegram
            </a>
            <button type="button" onClick={() => openLegal("contact")} className="acf-btn-contact" title="Contact Support" style={{ cursor: "pointer", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", borderRadius: "10px", fontWeight: 700, fontSize: "13px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "10px 16px" }}>
              <i className="fas fa-envelope" /> Support
            </button>
          </div>
          <div className="acf-links">
            <Link href="/#dmca" onClick={(e) => { e.preventDefault(); openLegal("dmca"); }} style={{ cursor: "pointer", color: "inherit", textDecoration: "none" }}>DMCA</Link>
            <span className="acf-dot">•</span>
            <Link href="/#privacy" onClick={(e) => { e.preventDefault(); openLegal("privacy"); }} style={{ cursor: "pointer", color: "inherit", textDecoration: "none" }}>Privacy</Link>
            <span className="acf-dot">•</span>
            <Link href="/#terms" onClick={(e) => { e.preventDefault(); openLegal("terms"); }} style={{ cursor: "pointer", color: "inherit", textDecoration: "none" }}>Terms</Link>
            <span className="acf-dot">•</span>
            <Link href="/#license" onClick={(e) => { e.preventDefault(); openLegal("license"); }} style={{ cursor: "pointer", color: "inherit", textDecoration: "none" }}>License</Link>
          </div>
          <div className="acf-copy">&copy; 2026 CineCub • Powered by TMDB</div>
        </div>
      </div>
    </footer>
  );
}
