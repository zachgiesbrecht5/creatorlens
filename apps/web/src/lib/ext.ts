import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { dealType, trackerBrand, DEAL_TYPE_RANK, type DealType } from "@creatorlens/engine";

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

export type ExtBrand = { brand: string; type: DealType; category: string | null; deals: number; confidence: string | null; first_seen: string | null; last_seen: string | null; repeat_partner: boolean; mass_sponsor: boolean; evidence_title: string | null; evidence_url: string | null; evidence: string | null; website: string | null };

const LABEL_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The brands on one or more creators' prints, read from the deal rows and typed:
 * Sponsored (paid language), Gifted (product sent), Affiliate (referral, code or tracked link),
 * Mention (a bare link or hashtag). Mentions are not deals and are left out unless includeMentions.
 * Junk and self-brands are always left out. Sorted Sponsored first, then newest.
 */
export async function brandRows(creators: { id: string; handle: string }[], includeMentions = false): Promise<Map<string, ExtBrand[]>> {
  const out = new Map<string, ExtBrand[]>();
  const handleOf = new Map(creators.map((c) => [c.id, c.handle]));
  const ids = creators.map((c) => c.id);
  type Agg = ExtBrand & { _score: number; _days: number[] };
  const groups = new Map<string, Agg>();
  for (let i = 0; i < ids.length; i += 50) {
    for (let from = 0; from < 20000; from += 1000) {
      const { data } = await supabaseAdmin().from("partnerships")
        .select("creator_id,brand_id,confidence_label,confidence_score,signal_type,evidence,content_url,content_title,published_at,brands!inner(name,category,website,is_junk,is_self_brand,is_mass_sponsor)")
        .in("creator_id", ids.slice(i, i + 50)).neq("status", "rejected").eq("brands.is_junk", false).eq("brands.is_self_brand", false)
        .order("id").range(from, from + 999);
      for (const p of (data || []) as any[]) {
        const type = dealType(p.signal_type, p.evidence, handleOf.get(p.creator_id));
        // a link through an affiliate network is filed under the network's domain: show the brand behind it
        const via = trackerBrand(p.evidence || "");
        const name = via ? titleCase(via) : p.brands.name;
        const key = `${p.creator_id}|${via ? `via:${via}` : p.brand_id}`;
        const score = DEAL_TYPE_RANK[type] * 100 + Number(p.confidence_score || 0);
        const day = p.published_at ? new Date(p.published_at).getTime() / 86400000 : NaN;
        let g = groups.get(key);
        if (!g) { g = { brand: name, type, category: via ? null : p.brands.category, deals: 0, confidence: null, first_seen: null, last_seen: null, repeat_partner: false, mass_sponsor: !!p.brands.is_mass_sponsor, evidence_title: null, evidence_url: null, evidence: null, website: via ? null : p.brands.website || null, _score: -1, _days: [] }; groups.set(key, g); }
        if (DEAL_TYPE_RANK[type] > DEAL_TYPE_RANK[g.type]) g.type = type;
        if ((LABEL_RANK[p.confidence_label] || 0) > (LABEL_RANK[g.confidence || ""] || 0)) g.confidence = p.confidence_label;
        if (p.published_at) { if (!g.first_seen || p.published_at < g.first_seen) g.first_seen = p.published_at; if (!g.last_seen || p.published_at > g.last_seen) g.last_seen = p.published_at; }
        if (type !== "Mention") { g.deals++; if (isFinite(day)) g._days.push(day); }
        if (score > g._score) { g._score = score; g.evidence_title = p.content_title; g.evidence_url = p.content_url; g.evidence = p.evidence ? String(p.evidence).replace(/\s+/g, " ").trim().slice(0, 160) : null; }
      }
      if (!data || data.length < 1000) break;
    }
  }
  for (const [key, g] of groups) {
    if (g.type === "Mention" && !includeMentions) continue;
    if (g.type === "Mention") g.deals = 0;
    g.repeat_partner = g._days.length >= 2 && Math.max(...g._days) - Math.min(...g._days) >= 30;
    const { _score, _days, ...row } = g;
    const cid = key.split("|")[0];
    (out.get(cid) || out.set(cid, []).get(cid)!).push(row);
  }
  for (const list of out.values()) list.sort((a, b) => DEAL_TYPE_RANK[b.type] - DEAL_TYPE_RANK[a.type] || String(b.last_seen || "").localeCompare(String(a.last_seen || "")));
  return out;
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
