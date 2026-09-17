import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export const metadata: Metadata = {
  title: "Privacy Policy — CineCub",
  description: "Privacy Policy and data protection terms for CineCub streaming platform.",
};

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100vh", padding: "100px 20px 60px", background: "var(--cv-dark-0, #06060c)", color: "var(--text-1, #ffffff)" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <BrandLogo mascotSize={42} />
          </Link>
          <Link href="/" style={{ color: "var(--pf-purple, #9d4edd)", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
            &larr; Back to Home
          </Link>
        </div>

        <article style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 16, padding: "32px 28px", lineHeight: 1.7 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Privacy Policy</h1>
          <p style={{ color: "var(--text-3, rgba(232, 232, 240, 0.6))", fontSize: 13, marginBottom: 24 }}>Last updated: September 17, 2026</p>

          <p style={{ marginBottom: 20 }}>
            Your privacy is important to CineCub. This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website or application.
          </p>

          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "24px 0 12px", color: "var(--pf-purple, #c77dff)" }}>1. Information We Collect and Store</h2>
          <p style={{ marginBottom: 16 }}>
            To provide a personalized streaming experience, we store your account credentials (such as username and verified email), customized watchlist, and watch history (including playback progress timestamps) securely in our Cloudflare D1 database, Cloudflare R2 cloud storage, and local browser storage.
          </p>
          <p style={{ marginBottom: 16 }}>
            When you sign in using Google OAuth, we receive your verified email address, display name, and avatar URL to authenticate your session. We do not sell, rent, or distribute your personal data to third parties.
          </p>

          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "24px 0 12px", color: "var(--pf-purple, #c77dff)" }}>2. Third-Party Services</h2>
          <p style={{ marginBottom: 16 }}>
            We utilize The Movie Database (TMDB) API for movie, TV show, and anime metadata and poster artwork. Third-party video embedding providers and proxy networks may utilize standard request headers to deliver streaming media chunks.
          </p>

          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "24px 0 12px", color: "var(--pf-purple, #c77dff)" }}>3. Managing and Deleting Your Data</h2>
          <p style={{ marginBottom: 16 }}>
            You have complete control over your account data. You can clear your watch history, edit your watchlist, update your credentials, or delete your account at any time through the Account Information and Profile settings.
          </p>

          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "24px 0 12px", color: "var(--pf-purple, #c77dff)" }}>4. Contact Us</h2>
          <p style={{ marginBottom: 0 }}>
            If you have questions or inquiries regarding your data privacy, you can reach our team at <strong>support@cinecub.stream</strong>.
          </p>
        </article>
      </div>
    </main>
  );
}
