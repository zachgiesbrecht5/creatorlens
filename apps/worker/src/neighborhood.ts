// Neighborhood agent. Given a roster creator (handle, platform, bio, size), find
// three adjacent creators: same lane, similar size, different person. Order of
// attack: (1) our own index, same category within a size band; (2) a Haiku call
// with web search that names candidates; (3) verify each candidate on the
// platform (cheap lookups) and keep the ones that fit; (4) queue free prints.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveChannel, lookupIgProfile, type IgToken } from "@creatorlens/engine";
import { alert } from "./observe";

const MODEL = process.env.ANTHROPIC_NEIGHBORHOOD_MODEL || "claude-haiku-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[neighborhood]", ...a);
const YT_KEY = process.env.YT_API_KEY || "";

type Cand = { platform: "youtube" | "instagram"; handle: string; display_name: string; avatar_url: string | null; followers: number | null; reason: string; job_id?: string | null; cached?: boolean; external_id?: string | null };

export async function runNeighborhoods(sb: SupabaseClient, limit = 1): Promise<number> {
  const { data: jobs } = await sb.from("neighborhoods").select("id,user_id,roster_creator_id").eq("status", "queued").order("created_at").limit(limit);
  if (!jobs?.length) return 0;
  for (const j of jobs) {
    await sb.from("neighborhoods").update({ status: "running" }).eq("id", j.id);
    try { await runOne(sb, j.id, j.user_id, j.roster_creator_id); }
    catch (e: any) {
      log("failed", j.id, e?.message);
      await alert(sb, "neighborhood failed", { id: j.id, error: String(e?.message || e).slice(0, 300) });
      await sb.from("neighborhoods").update({ status: "failed", error: String(e?.message || e).slice(0, 400), finished_at: new Date().toISOString() }).eq("id", j.id);
    }
  }
  return jobs.length;
}

async function houseIgToken(sb: SupabaseClient): Promise<IgToken | null> {
  const { data } = await sb.from("ig_connections").select("ig_user_id,access_token").eq("is_house", true).eq("healthy", true).or("cooldown_until.is.null,cooldown_until.lt.now()").limit(1).maybeSingle();
  return data ? { igUserId: data.ig_user_id, accessToken: data.access_token } : null;
}

async function runOne(sb: SupabaseClient, id: string, userId: string, rosterId: string) {
  const { data: r } = await sb.from("roster_creators").select("id,name,handle,platform,followers,niche,bio,pitch_angle").eq("id", rosterId).single();
  if (!r) throw new Error("roster creator missing");
  const platform: "youtube" | "instagram" = r.platform === "youtube" ? "youtube" : "instagram";
  const handle = String(r.handle || "").replace(/^@/, "").toLowerCase();
  const size = Number(r.followers || 0);
  const lo = size ? size * 0.25 : 0, hi = size ? size * 4 : Infinity;
  const inBand = (n: number | null) => !size || !n || (n >= lo && n <= hi);
  const picked: Cand[] = [];
  const seen = new Set<string>([handle]);

  // 1. our index: same category, similar size, same platform
  const { data: rosterCat } = await sb.from("creators").select("category").eq("platform", platform).ilike("handle", handle).maybeSingle();
  const cat = rosterCat?.category || null;
  if (cat) {
    const { data: idx } = await sb.from("creators").select("handle,display_name,avatar_url,followers,category,platform,external_id").eq("platform", platform).eq("category", cat).not("last_scanned_at", "is", null).order("followers", { ascending: false }).limit(60);
    for (const c of idx || []) {
      if (picked.length >= 2) break;   // leave room for fresh discoveries
      if (seen.has(c.handle.toLowerCase()) || !inBand(c.followers)) continue;
      seen.add(c.handle.toLowerCase());
      picked.push({ platform, handle: c.handle, display_name: c.display_name || c.handle, avatar_url: c.avatar_url, followers: c.followers, reason: `Same lane (${cat}) and a similar audience size. Already in the index.`, cached: true, external_id: c.external_id });
    }
  }

  // 2. the agent names candidates
  if (client && picked.length < 3) {
    const sys = `You find creators similar to a given creator for a talent manager. Return 8 candidates on the SAME platform who are clearly in the same content lane and roughly the same audience size (within 4x). Prefer active, real accounts. Use web search to verify handles exist. Never return the creator themselves, and never return mega-celebrities unless the input creator is one. Reply ONLY with JSON: {"candidates":[{"handle":"...","why":"<one sentence on the overlap>"}]}`;
    const user = `Platform: ${platform}\nCreator: ${r.name} (@${handle})\nAudience: ${size || "unknown"} ${platform === "youtube" ? "subscribers" : "followers"}\nNiche: ${r.niche || cat || "unknown"}\nBio: ${String(r.bio || "").slice(0, 300)}\nAngle: ${String(r.pitch_angle || "").slice(0, 300)}`;
    const msg = await client.messages.create({ model: MODEL, max_tokens: 1500, temperature: 0.4, system: sys, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 } as any], messages: [{ role: "user", content: user }] });
    const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    const cands: { handle: string; why: string }[] = m ? (JSON.parse(m[0]).candidates || []) : [];
    const tok = platform === "instagram" ? await houseIgToken(sb) : null;
    for (const c of cands) {
      if (picked.length >= 3) break;
      const h = String(c.handle || "").replace(/^@/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\/.*$/, "").trim();
      if (!h || seen.has(h.toLowerCase())) continue;
      seen.add(h.toLowerCase());
      try {
        if (platform === "youtube" && YT_KEY) {
          const ch = await resolveChannel(YT_KEY, h);
          if (!ch || !inBand(ch.subs)) continue;
          picked.push({ platform, handle: ch.handle || ch.id, display_name: ch.title, avatar_url: ch.thumbnail || null, followers: ch.subs ?? null, reason: c.why, external_id: ch.id });
        } else if (platform === "instagram" && tok) {
          const p = await lookupIgProfile(tok, h);
          if (!p || !inBand(p.followers)) continue;
          picked.push({ platform, handle: p.username, display_name: p.name, avatar_url: p.avatar, followers: p.followers, reason: c.why });
        }
      } catch { /* skip unverifiable */ }
    }
  }

  // 3. free prints for each pick (source=neighborhood: no credit), unlock for the user
  for (const c of picked) {
    const key = c.handle.toLowerCase();
    await sb.from("creator_access").upsert({ user_id: userId, platform: c.platform, handle: key }, { onConflict: "user_id,platform,handle", ignoreDuplicates: true });
    if (c.external_id) await sb.from("creator_access").upsert({ user_id: userId, platform: c.platform, handle: String(c.external_id).toLowerCase() }, { onConflict: "user_id,platform,handle", ignoreDuplicates: true });
    if (c.cached) continue;
    const { data: existing } = await sb.from("scan_jobs").select("id").eq("platform", c.platform).ilike("handle", c.handle).in("status", ["queued", "running", "rate_limited"]).limit(1);
    if (existing?.length) { c.job_id = existing[0].id; continue; }
    const { data: job } = await sb.from("scan_jobs").insert({ user_id: userId, platform: c.platform, handle: c.handle, priority: 4, source: "neighborhood" }).select("id").single();
    c.job_id = job?.id || null;
  }
  await sb.from("neighborhoods").update({ status: "done", candidates: picked, finished_at: new Date().toISOString() }).eq("id", id);
  await sb.from("roster_creators").update({ neighborhood_at: new Date().toISOString() }).eq("id", rosterId);
  log(r.name, picked.length, "neighbors");
}
