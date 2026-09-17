import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface CineCubBindings {
  DB?: D1Database;
  STORAGE?: R2Bucket;
  JWT_SECRET?: string;
  TMDB_API_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_FALLBACK_FROM_EMAIL?: string;
  GOOGLE_CLIENT_ID?: string;
  NEXT_PUBLIC_GOOGLE_CLIENT_ID?: string;
}

/**
 * Safely retrieve Cloudflare edge bindings (D1, R2, vars)
 */
export async function getCineCubBindings(): Promise<CineCubBindings> {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const env = (ctx?.env as CineCubBindings) || {};
    return {
      DB: env.DB,
      STORAGE: env.STORAGE,
      JWT_SECRET: env.JWT_SECRET || process.env.JWT_SECRET || "",
      TMDB_API_KEY: env.TMDB_API_KEY || process.env.TMDB_API_KEY || "",
      RESEND_API_KEY: env.RESEND_API_KEY || process.env.RESEND_API_KEY || "",
      RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "CineCub <noreply@cinecub.stream>",
      RESEND_FALLBACK_FROM_EMAIL: env.RESEND_FALLBACK_FROM_EMAIL || process.env.RESEND_FALLBACK_FROM_EMAIL || "CineCub <onboarding@resend.dev>",
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID || env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
    };
  } catch {
    return {
      JWT_SECRET: process.env.JWT_SECRET || "",
      TMDB_API_KEY: process.env.TMDB_API_KEY || "",
      RESEND_API_KEY: process.env.RESEND_API_KEY || "",
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || "CineCub <noreply@cinecub.stream>",
      RESEND_FALLBACK_FROM_EMAIL: process.env.RESEND_FALLBACK_FROM_EMAIL || "CineCub <onboarding@resend.dev>",
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
    };
  }
}
