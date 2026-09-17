import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export const metadata: Metadata = {
  title: "Terms of Service — CineCub",
  description: "Terms of Service and usage conditions for CineCub streaming platform.",
};

export default function TermsPage() {
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
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Terms of Service</h1>
          <p style={{ color: "var(--text-3, rgba(232, 232, 240, 0.6))", fontSize: 13, marginBottom: 24 }}>Last updated: September 17, 2026</p>

          <p style={{ marginBottom: 20 }}>
            Welcome to CineCub. By accessing or using our website and application, you agree to be bound by these Terms of Service.
          </p>

          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "24px 0 12px", color: "var(--pf-purple, #c77dff)" }}>1. Acceptance of Terms</h2>
          <p style={{ marginBottom: 16 }}>
            You must be at least 13 years of age to use this platform. By using CineCub, you warrant that you meet this age requirement and agree to abide by all applicable laws and regulations.
          </p>

          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "24px 0 12px", color: "var(--pf-purple, #c77dff)" }}>2. Third-Party Content Disclaimer</h2>
          <p style={{ marginBottom: 16 }}>
            CineCub does not host, upload, or store any media files or video streams on its servers. All videos, movies, TV series, and media are hosted and served by non-affiliated third-party providers. We assume no liability for external content.
          </p>

          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "24px 0 12px", color: "var(--pf-purple, #c77dff)" }}>3. User Conduct & Accounts</h2>
          <p style={{ marginBottom: 16 }}>
            Users are responsible for maintaining the confidentiality of their credentials and session tokens. You agree not to attempt to reverse-engineer or disrupt any portion of the service.
          </p>

          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "24px 0 12px", color: "var(--pf-purple, #c77dff)" }}>4. Contact & Inquiries</h2>
          <p style={{ marginBottom: 0 }}>
            For legal notices, DMCA inquiries, or questions regarding these Terms, contact our team at <strong>support@cinecub.stream</strong>.
          </p>
        </article>
      </div>
    </main>
  );
}
