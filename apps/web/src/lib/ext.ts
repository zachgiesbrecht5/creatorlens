import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import type { DealType } from "@creatorlens/engine";
import { aggregateDeals, type ExtBrand } from "@/lib/ext-agg";
export type { ExtBrand } from "@/lib/ext-agg";

// Shared helpers for the Sponsorprint for YouTube extension: creator lookup that
// costs no YouTube quota, the brand rows a print shows, and the sheet feed token.

const APP = "https://sponsorprint.com";
const esc = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export type ExtCreator = { id: string; platform: string; handle: string; external_id: string | null; display_name: string | null; followers: number | null; avatar_url: string | null; category: string | null; last_scanned_at: string | null };

/** Clean whatever the extension read off the page into a handle or channel id. */
export function cleanRef(raw: unknown) {
  let s = String(raw || "").trim();
  try { s = decodeURIComponent(s); } catch { /* keep as typed */ }
  return s.replace(/^@/, "").replace(/^https?:\/\/(www\.|m\.)?youtube\.com\//, "").replace(/^(channel|c|user)\//, "").replace(/^@/, "").replace(/[/?#].*$/, "").slice(0, 80);
}

/** Find a printed creator in the index by handle or channel id. Database only. */
export async function findCreator(platform: "youtube" | "instagram", ref: string): Promise<ExtCreator | null> {
  if (!ref) return null;
  const admin = supabaseAdmin();
  const cols = "id,platform,handle,external_id,display_name,followers,avatar_url,category,last_scanned_at";
  if (platform === "youtube" && /^UC[A-Za-z0-9_-]{20,}$/.test(ref)) {
    const { data } = await admin.from("creators").select(cols).eq("platform", "youtube").eq("external_id", ref).maybeSingle();
    if (data) return data as ExtCreator;
  }
  const { data } = await admin.from("creators").select(cols).eq("platform", platform).ilike("handle", esc(ref)).limit(1);
  return (data?.[0] as ExtCreator) || null;
}

/** The brands on one or more creators' prints, typed. Junk and self-brands are always left out. See aggregateDeals. */
export async function brandRows(creators: { id: string; handle: string }[], includeMentions = false): Promise<Map<string, ExtBrand[]>> {
  const ids = creators.map((c) => c.id);
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    for (let from = 0; from < 20000; from += 1000) {
      const { data } = await supabaseAdmin().from("partnerships")
        .select("creator_id,brand_id,confidence_label,confidence_score,signal_type,evidence,content_url,content_title,published_at,brands!inner(name,category,website,is_junk,is_self_brand,is_mass_sponsor)")
        .in("creator_id", ids.slice(i, i + 50)).neq("status", "rejected").eq("brands.is_junk", false).eq("brands.is_self_brand", false)
        .order("id").range(from, from + 999);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return aggregateDeals(rows, creators, includeMentions);
}

export const TYPE_LABEL: Record<DealType, string> = { Sponsored: "Sponsored", Gifted: "Gifted", Affiliate: "Affiliate or code", Mention: "Mention only" };

export const printUrl = (c: { platform: string; handle: string }) => `${APP}/c/${c.platform}/${encodeURIComponent(c.handle)}`;

// ---- sheet feed token -------------------------------------------------------
// The feed link goes inside a Google Sheet formula, so it must not be the API key.
// The token is derived from the user's id and current key: rotating or revoking the
// key in Settings kills every feed link made with it.
const sign = (userId: string, apiKey: string) => createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY || "dev").update(`ext-feed:${userId}:${apiKey}`).digest("base64url").slice(0, 32);

export function feedToken(userId: string, apiKey: string) {
  return `${Buffer.from(userId.replace(/-/g, ""), "hex").toString("base64url")}.${sign(userId, apiKey)}`;
}

export async function profileFromFeedToken(token: string) {
  const [idPart, sig] = String(token || "").split(".");
  if (!idPart || !sig) return null;
  const hex = Buffer.from(idPart, "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const { data } = await supabaseAdmin().from("profiles").select("id,email,plan,org_id,api_key").eq("id", id).maybeSingle();
  if (!data?.api_key) return null;
  const want = Buffer.from(sign(data.id, data.api_key)); const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return data;
}

export const feedUrl = (userId: string, apiKey: string) => `${APP}/api/ext/feed?t=${feedToken(userId, apiKey)}`;
