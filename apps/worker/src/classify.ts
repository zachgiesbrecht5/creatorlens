// Classification: creator vertical, brand category, self-brand detection.
//
// Uses a small Claude model when ANTHROPIC_API_KEY is set; falls back to the
// engine's keyword matcher (creators only) when it is not. Everything here is
// idempotent and cheap: one call per creator scan, one batched call per ~25
// unclassified brands, and an idle-time backfill so old rows get filled in.

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES, matchCategory, type Category } from "@creatorlens/engine";

const MODEL = process.env.ANTHROPIC_CLASSIFY_MODEL || "claude-haiku-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME"
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[classify]", ...a);

const CATS = CATEGORIES.filter((c) => c !== "Other");
const norm = (s: string | null | undefined): Category => {
  const t = String(s || "").trim();
  return (CATEGORIES as readonly string[]).includes(t) ? (t as Category) : matchCategory(t);
};

async function ask(system: string, user: string): Promise<any | null> {
  if (!client) return null;
  try {
    const msg = await client.messages.create({ model: MODEL, max_tokens: 1500, temperature: 0, system, messages: [{ role: "user", content: user }] });
    const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : null;
  } catch (e: any) {
    log("model call failed:", e?.message);
    return null;
  }
}

// ── Creator vertical ───────────────────────────────────────────
// Input: name, handle, bio, the titles of their sponsored content (what the
// scan saw). Output: one vertical from the fixed list, plus any brand names the
// bio says the creator OWNS (merch line, company, agency) so those get flagged.
export async function classifyCreator(sb: SupabaseClient, creatorId: string, force = false) {
  const { data: c } = await sb.from("creators").select("id,display_name,handle,bio,category,classified_at,platform").eq("id", creatorId).single();
  if (!c) return;
  if (c.classified_at && !force) return;
  const { data: titles } = await sb.from("partnerships").select("content_title,brand_id").eq("creator_id", creatorId).order("published_at", { ascending: false }).limit(20);
  const sample = [...new Set((titles || []).map((t) => t.content_title).filter(Boolean))].slice(0, 15);

  let category: Category = matchCategory(c.bio || "");
  let ownBrands: string[] = [];
  const out = await ask(
    `You classify social media creators for a sponsorship database. Reply with JSON only: {"category": <one of ${JSON.stringify(CATS)}>, "own_brands": [<names of brands, product lines, companies or agencies this creator OWNS or FOUNDED, taken only from the bio; [] if none>]}. Pick the single vertical a brand marketer would file this creator under. "Lifestyle" only when nothing more specific fits.`,
    `Platform: ${c.platform}\nName: ${c.display_name || ""}\nHandle: @${c.handle}\nBio: ${(c.bio || "").slice(0, 800)}\nRecent sponsored content titles:\n${sample.map((t) => "- " + String(t).slice(0, 120)).join("\n") || "(none)"}`,
  );
  if (out && typeof out === "object") {
    category = norm(out.category);
    ownBrands = Array.isArray(out.own_brands) ? out.own_brands.map(String).filter(Boolean) : [];
  }
  await sb.from("creators").update({ category, classified_at: new Date().toISOString() }).eq("id", creatorId);

  // Self-brands: anything the bio says they own, plus any brand whose key is
  // basically the creator's name or handle (MrBeast -> Feastables is caught by
  // the model; "Andy Yen" -> "andyyen shop" is caught here).
  const keys = new Set<string>();
  const k = (s: string) => s.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
  for (const b of ownBrands) keys.add(k(b));
  const selfKeys = [k(c.handle), k(c.display_name || "")].filter((s) => s.length >= 5);
  const { data: theirBrands } = await sb.from("brand_wall").select("brand_id,brand").eq("creator_id", creatorId);
  const flag: string[] = [];
  for (const b of theirBrands || []) {
    const bk = k(b.brand);
    if (keys.has(bk) || selfKeys.some((s) => bk === s || (bk.length >= 5 && (s.includes(bk) || bk.includes(s))))) flag.push(b.brand_id);
  }
  if (flag.length) {
    await sb.from("brands").update({ is_self_brand: true }).in("id", flag);
    log(`@${c.handle}: ${category}; self-brands flagged: ${flag.length}`);
  } else log(`@${c.handle}: ${category}`);
}

// ── Brand category ─────────────────────────────────────────────
// Batched: name + domain + one evidence line per brand. The model also gets a
// chance to say "this is not a brand" (a person, a song, a URL fragment) which
// we treat as junk.
export async function classifyBrands(sb: SupabaseClient, ids?: string[], limit = 25) {
  let q = sb.from("brands").select("id,name,key,domain,website").is("classified_at", null).eq("is_junk", false).order("deal_count", { ascending: false }).limit(limit);
  if (ids?.length) q = sb.from("brands").select("id,name,key,domain,website").in("id", ids).is("classified_at", null).eq("is_junk", false);
  const { data: brands } = await q;
  if (!brands?.length) return 0;

  const evid = new Map<string, string>();
  const { data: ev } = await sb.from("partnerships").select("brand_id,evidence").in("brand_id", brands.map((b) => b.id)).order("confidence_score", { ascending: false }).limit(brands.length * 3);
  for (const e of ev || []) if (!evid.has(e.brand_id) && e.evidence) evid.set(e.brand_id, String(e.evidence).slice(0, 160));

  const out = await ask(
    `You categorise sponsor brands for a creator-marketing database. For each item reply with its category from ${JSON.stringify(CATS)} (what the brand sells, from a marketer's point of view), or "JUNK" if the name is not a real brand or company (a person, a song, a URL fragment, a generic word, a platform like YouTube). Reply with JSON only: {"<id>": "<category|JUNK>", ...}.`,
    brands.map((b) => `${b.id} | ${b.name} | ${b.domain || b.website || "no site"} | ${evid.get(b.id) || ""}`).join("\n"),
  );
  const now = new Date().toISOString();
  for (const b of brands) {
    const v = out && typeof out === "object" ? String(out[b.id] || "") : "";
    if (v === "JUNK") await sb.from("brands").update({ is_junk: true, classified_at: now }).eq("id", b.id);
    else await sb.from("brands").update({ category: v ? norm(v) : (matchCategory(b.name) === "Other" ? null : matchCategory(b.name)), classified_at: out ? now : null }).eq("id", b.id);
  }
  log(`brands classified: ${brands.length}${out ? "" : " (no model; keyword fallback, will retry)"}`);
  return brands.length;
}

// ── Verticals a brand books ────────────────────────────────────
// {"Tech": 3, "Lifestyle": 1}: distinct creators per creator vertical.
export async function rollupVerticals(sb: SupabaseClient, brandIds: string[]) {
  for (const id of brandIds) {
    const { data: rows } = await sb.from("partnerships").select("creator_id, creators(category)").eq("brand_id", id).neq("status", "rejected");
    const seen = new Map<string, string>();
    for (const r of rows || []) seen.set(r.creator_id, ((r as any).creators?.category as string) || "Other");
    const verticals: Record<string, number> = {};
    for (const cat of seen.values()) verticals[cat] = (verticals[cat] || 0) + 1;
    await sb.from("brands").update({ verticals }).eq("id", id);
  }
}

// ── Idle backfill ──────────────────────────────────────────────
export async function classifyBackfill(sb: SupabaseClient) {
  const { data: cs } = await sb.from("creators").select("id").is("classified_at", null).order("last_scanned_at", { ascending: false }).limit(3);
  for (const c of cs || []) await classifyCreator(sb, c.id);
  const n = await classifyBrands(sb);
  if (cs?.length || n) {
    // refresh verticals for brands touched by the creators we just classified
    const ids = new Set<string>();
    for (const c of cs || []) {
      const { data } = await sb.from("partnerships").select("brand_id").eq("creator_id", c.id);
      for (const r of data || []) ids.add(r.brand_id);
    }
    await rollupVerticals(sb, [...ids]);
  }
  return (cs?.length || 0) + n;
}
