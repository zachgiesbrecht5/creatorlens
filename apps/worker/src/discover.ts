// Discover agent. Nightly, pick up to DISCOVER_PER_DAY creators nobody asked
// for, print them, and make them public. Seeds, in order: (1) roster creators
// across all users that haven't seeded a discovery in 30 days; (2) the
// category with the fewest printed creators, seeded by its best-known
// creator. Candidates come from the same Haiku+web-search step the
// neighborhood uses, verified on the platform, size-banded.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveChannel, lookupIgProfile, type IgToken } from "@creatorlens/engine";
import { alert } from "./observe";

const MODEL = process.env.ANTHROPIC_NEIGHBORHOOD_MODEL || "claude-haiku-4-5";
const PER_DAY = Number(process.env.DISCOVER_PER_DAY || 8);
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[discover]", ...a);
const YT_KEY = process.env.YT_API_KEY || "";

type Seed = { platform: "youtube" | "instagram"; handle: string; name: string; followers: number | null; niche: string | null; bio: string | null; why: string };

async function houseIgToken(sb: SupabaseClient): Promise<IgToken | null> {
  const { data } = await sb.from("ig_connections").select("ig_user_id,access_token").eq("is_house", true).eq("healthy", true).or("cooldown_until.is.null,cooldown_until.lt.now()").limit(1).maybeSingle();
  return data ? { igUserId: data.ig_user_id, accessToken: data.access_token } : null;
}

async function seeds(sb: SupabaseClient): Promise<Seed[]> {
  const out: Seed[] = [];
  const { data: roster } = await sb.from("roster_creators").select("id,name,handle,platform,followers,niche,bio,neighborhood_at").or("neighborhood_at.is.null,neighborhood_at.lt." + new Date(Date.now() - 30 * 864e5).toISOString()).order("created_at").limit(4);
  for (const r of roster || []) if (r.handle) out.push({ platform: r.platform === "youtube" ? "youtube" : "instagram", handle: String(r.handle).replace(/^@/, ""), name: r.name, followers: r.followers, niche: r.niche, bio: r.bio, why: `next to ${r.name}, who a manager on Sponsorprint represents` });
  // thinnest category
  const { data: cats } = await sb.rpc("category_counts").select("category,n").order("n").limit(1) as any;
  if (cats?.[0]?.category) {
    const { data: best } = await sb.from("creators").select("handle,display_name,platform,followers,category,bio").eq("category", cats[0].category).not("last_scanned_at", "is", null).order("followers", { ascending: false }).limit(1).maybeSingle();
    if (best) out.push({ platform: best.platform as any, handle: best.handle, name: best.display_name || best.handle, followers: best.followers, niche: best.category, bio: best.bio, why: `${cats[0].category} is thin in the index; ${best.display_name || best.handle} is its best-known print` });
  }
  return out;
}

export async function discover(sb: SupabaseClient): Promise<number> {
  if (!client) return 0;
  const day = new Date().toISOString().slice(0, 10);
  const { count: today } = await sb.from("creators").select("*", { count: "exact", head: true }).gte("discovered_at", `${day}T00:00:00Z`);
  let budget = PER_DAY - (today || 0);
  if (budget <= 0) return 0;
  const tok = await houseIgToken(sb);
  let queued = 0;
  for (const s of await seeds(sb)) {
    if (budget <= 0) break;
    try {
      const sys = `You find creators similar to a given creator for a talent manager. Return 6 candidates on the SAME platform, same content lane, roughly the same audience size (within 4x), real and active. Never the creator themselves. Reply ONLY with JSON: {"candidates":[{"handle":"...","why":"<one sentence>"}]}`;
      const user = `Platform: ${s.platform}\nCreator: ${s.name} (@${s.handle})\nAudience: ${s.followers || "unknown"}\nNiche: ${s.niche || "unknown"}\nBio: ${String(s.bio || "").slice(0, 300)}`;
      const msg = await client.messages.create({ model: MODEL, max_tokens: 1200, temperature: 0.5, system: sys, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 } as any], messages: [{ role: "user", content: user }] });
      const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
      const m = text.match(/\{[\s\S]*\}/); if (!m) continue;
      const cands: { handle: string; why: string }[] = JSON.parse(m[0]).candidates || [];
      const lo = s.followers ? s.followers * 0.25 : 0, hi = s.followers ? s.followers * 4 : Infinity;
      let got = 0;
      for (const c of cands) {
        if (got >= 2 || budget <= 0) break;
        const h = String(c.handle || "").replace(/^@/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\/.*$/, "").trim();
        if (!h || h.toLowerCase() === s.handle.toLowerCase()) continue;
        const { data: known } = await sb.from("creators").select("id,last_scanned_at").eq("platform", s.platform).ilike("handle", h).maybeSingle();
        if (known?.last_scanned_at) continue;   // already printed
        let ok = false, ext: string | null = null, handle = h;
        try {
          if (s.platform === "youtube" && YT_KEY) { const ch = await resolveChannel(YT_KEY, h); if (ch && (!s.followers || (ch.subs >= lo && ch.subs <= hi))) { ok = true; ext = ch.id; handle = ch.handle || ch.id; } }
          else if (s.platform === "instagram" && tok) { const p = await lookupIgProfile(tok, h); if (p && (!s.followers || (p.followers >= lo && p.followers <= hi))) { ok = true; handle = p.username; } }
        } catch { ok = false; }
        if (!ok) continue;
        const { data: existing } = await sb.from("scan_jobs").select("id").eq("platform", s.platform).ilike("handle", handle).in("status", ["queued", "running", "rate_limited"]).limit(1);
        if (existing?.length) continue;
        // the reason rides on the job; the worker stamps the creator public when the print lands
        await sb.from("scan_jobs").insert({ user_id: null, platform: s.platform, handle, priority: 7, source: "discover", note: `${c.why} Found ${s.why}.` });
        void ext;
        got++; budget--; queued++;
      }
      // roster seeds: mark so the same one doesn't reseed nightly
      await sb.from("roster_creators").update({ neighborhood_at: new Date().toISOString() }).ilike("handle", s.handle).eq("platform", s.platform);
    } catch (e: any) { log("seed failed", s.handle, e?.message); }
  }
  if (queued) log("queued", queued, "discoveries");
  else await alert(sb, "discover queued nothing", { seeds: "none verified" }).catch(() => {});
  return queued;
}
