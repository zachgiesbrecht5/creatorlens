import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { lastFullMonth } from "@/lib/report";
const base = process.env.NEXT_PUBLIC_APP_URL || "https://sponsorprint.com";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let creators: any[] | null = [];
  try { const admin = supabaseAdmin(); ({ data: creators } = await admin.from("creators").select("platform,handle,last_scanned_at").not("last_scanned_at", "is", null).order("last_scanned_at", { ascending: false }).limit(5000)); } catch { creators = []; }
  const months: string[] = []; const d = new Date(lastFullMonth() + "-01T00:00:00Z"); for (let i = 0; i < 6; i++) { months.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7)); }
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/reports/${months[0]}`, changeFrequency: "monthly", priority: 0.9 },
    ...months.slice(1).map((m) => ({ url: `${base}/reports/${m}`, changeFrequency: "yearly" as const, priority: 0.6 })),
    ...(creators || []).map((c) => ({ url: `${base}/p/${c.platform}/${c.handle}`, lastModified: new Date(c.last_scanned_at!), changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
