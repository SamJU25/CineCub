import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/_next/static/", "/_next/image/"],
        disallow: [
          "/api/",
          "/m3u8-proxy",
          "/ts-proxy",
          "/profile",
          "/reset-password",
          "/verify-email",
          "/_next/",
        ],
      },
      {
        userAgent: ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Applebot"],
        allow: "/",
      },
    ],
    sitemap: "https://cinecub.stream/sitemap.xml",
    host: "https://cinecub.stream",
  };
}
