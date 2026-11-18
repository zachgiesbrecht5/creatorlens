import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";

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

export type ExtBrand = { brand: string; category: string | null; deals: number; confidence: string | null; first_seen: string | null; last_seen: string | null; repeat_partner: boolean; mass_sponsor: boolean; evidence_title: string | null; evidence_url: string | null; website: string | null };

/** The brands on one or more creators' prints, newest deal first. Junk and self-brands are left out. */
export async function brandRows(creatorIds: string[]): Promise<Map<string, ExtBrand[]>> {
  const out = new Map<string, ExtBrand[]>();
  for (let i = 0; i < creatorIds.length; i += 100) {
    const { data } = await supabaseAdmin().from("brand_wall_mv")
      .select("creator_id,brand,category,deals,best_label,first_seen,last_seen,repeat_partner,is_mass_sponsor,content_title,content_url,website")
      .in("creator_id", creatorIds.slice(i, i + 100)).eq("is_junk", false).eq("is_self_brand", false)
      .order("last_seen", { ascending: false }).limit(5000);
    for (const w of (data || []) as any[]) {
      const list = out.get(w.creator_id) || out.set(w.creator_id, []).get(w.creator_id)!;
      list.push({ brand: w.brand, category: w.category, deals: Number(w.deals || 0), confidence: w.best_label, first_seen: w.first_seen, last_seen: w.last_seen, repeat_partner: !!w.repeat_partner, mass_sponsor: !!w.is_mass_sponsor, evidence_title: w.content_title, evidence_url: w.content_url, website: w.website || null });
    }
  }
  return out;
}

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
