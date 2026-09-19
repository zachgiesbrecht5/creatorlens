import type { MetadataRoute } from "next";
const base = process.env.NEXT_PUBLIC_APP_URL || "https://sponsorprint.com";
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/", "/p/", "/reports/", "/pricing", "/privacy", "/terms"], disallow: ["/api/", "/c/", "/brands/", "/settings", "/queue", "/start", "/batch", "/pipeline", "/updates", "/watchlist", "/signals", "/creators", "/scans", "/n/"] }], sitemap: `${base}/sitemap.xml` };
}
