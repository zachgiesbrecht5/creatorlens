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
  const { data: jobs } = await sb.from("neighborhoods").select("id,user_id,roster_creator_id,creator_id,exclude").eq("status", "queued").order("created_at").limit(limit);
  if (!jobs?.length) return 0;
  for (const j of jobs) {
    await sb.from("neighborhoods").update({ status: "running" }).eq("id", j.id);
    try { await runOne(sb, j.id, j.user_id, j.roster_creator_id, j.creator_id, (j.exclude || []) as string[]); }
    catch (e: any) {
      log("failed", j.id, e?.message);
      await alert(sb, "neighborhood failed", { id: j.id, error: String(e?.message || e).slice(0, 300) });
      await sb.from("neighborhoods").update({ status: "failed", error: String(e?.message || e).slice(0, 400), finished_at: new Date().toISOString() }).eq("id", j.id);
    }
  }
  return jobs.length;
}

async function houseIgToken(sb: SupabaseClient): Promise<IgToken | null> {
  const { data } = await sb.from("ig_connections").select("ig_user_id,access_token").or("cooldown_until.is.null,cooldown_until.lt.now()").limit(1).maybeSingle();
  return data ? { igUserId: data.ig_user_id, accessToken: data.access_token } : null;
}

async function runOne(sb: SupabaseClient, id: string, userId: string, rosterId: string | null, creatorId: string | null, exclude: string[]) {
  let r0: any = null;
  if (rosterId) { const { data } = await sb.from("roster_creators").select("id,name,handle,platform,followers,niche,bio,pitch_angle,avatar_url").eq("id", rosterId).single(); r0 = data; }
  else if (creatorId) { const { data } = await sb.from("creators").select("id,display_name,handle,platform,followers,category,bio,avatar_url").eq("id", creatorId).single(); if (data) r0 = { id: null, name: data.display_name || data.handle, handle: data.handle, platform: data.platform, followers: data.followers, niche: data.category, bio: data.bio, pitch_angle: null, avatar_url: data.avatar_url }; }
  if (!r0) throw new Error("seed creator missing");
  let r = r0;
  const platform: "youtube" | "instagram" = r.platform === "youtube" ? "youtube" : "instagram";
  const handle = String(r.handle || "").replace(/^@/, "").toLowerCase();
  // roster rows added by hand have no size/avatar/bio: fill them from the platform so the agent has something to go on
  if (r.id && (!r.avatar_url || !r.followers)) {
    try {
      if (platform === "youtube" && YT_KEY) { const ch = await resolveChannel(YT_KEY, handle); if (ch) { const patch = { followers: ch.subs ?? r.followers, avatar_url: ch.thumbnail || r.avatar_url, bio: r.bio || (ch.description || "").slice(0, 400) }; await sb.from("roster_creators").update(patch).eq("id", r.id); r = { ...r, ...patch }; } }
      else { const tok = await houseIgToken(sb); const p = tok ? await lookupIgProfile(tok, handle) : null; if (p) { const patch = { followers: p.followers ?? r.followers, avatar_url: p.avatar || r.avatar_url }; await sb.from("roster_creators").update(patch).eq("id", r.id); r = { ...r, ...patch }; } }
    } catch (e: any) { log("roster enrich failed", handle, e?.message); }
  }
  const size = Number(r.followers || 0);
  const lo = size ? size * 0.1 : 0, hi = size ? size * 10 : Infinity;
  const inBand = (n: number | null) => !size || !n || (n >= lo && n <= hi);
  const picked: Cand[] = [];
  const seen = new Set<string>([handle, ...exclude.map((h) => String(h).toLowerCase())]);
  // everything already suggested to this user (any seed): fresh faces every round
  const { data: priorHoods } = await sb.from("neighborhoods").select("candidates").eq("user_id", userId).neq("id", id).limit(50);
  for (const ph of priorHoods || []) for (const c of (ph.candidates || []) as any[]) if (c?.handle) seen.add(String(c.handle).toLowerCase());
  const avoid = [...seen].filter((h) => h !== handle).slice(0, 40);

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
    const user = `Platform: ${platform}\nCreator: ${r.name} (@${handle})\nAudience: ${size || "unknown"} ${platform === "youtube" ? "subscribers" : "followers"}\nNiche: ${r.niche || cat || "unknown"}\nBio: ${String(r.bio || "").slice(0, 300)}\nAngle: ${String(r.pitch_angle || "").slice(0, 300)}${avoid.length ? `\n\nDo NOT return any of these (already shown): ${avoid.map((h) => "@" + h).join(", ")}. Find different people.` : ""}`;
    const msg = await client.messages.create({ model: MODEL, max_tokens: 1500, temperature: 0.4, system: sys, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 } as any], messages: [{ role: "user", content: user }] });
    const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    let cands: { handle: string; why: string }[] = [];
    try { cands = m ? (JSON.parse(m[0]).candidates || []) : []; } catch { cands = []; }
    log(handle, "model candidates:", cands.map((c) => c.handle).join(", ") || "(none)", "| text:", text.slice(0, 200).replace(/\n/g, " "));
    await sb.from("neighborhoods").update({ error: null, candidates: [], debug: { raw: text.slice(0, 2000), candidates: cands } }).eq("id", id);
    const tok = platform === "instagram" ? await houseIgToken(sb) : null;
    if (platform === "instagram" && !tok) log("no house Instagram token available");
    const unverified: Cand[] = [];
    for (const c of cands) {
      if (picked.length >= 3) break;
      const h = String(c.handle || "").replace(/^@/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\/.*$/, "").trim();
      if (!h || seen.has(h.toLowerCase())) continue;
      seen.add(h.toLowerCase());
      try {
        if (platform === "youtube" && YT_KEY) {
          const ch = await resolveChannel(YT_KEY, h);
          if (ch && inBand(ch.subs)) { picked.push({ platform, handle: ch.handle || ch.id, display_name: ch.title, avatar_url: ch.thumbnail || null, followers: ch.subs ?? null, reason: c.why, external_id: ch.id }); continue; }
          if (ch) { log("out of band", h, ch.subs); continue; }
        } else if (platform === "instagram" && tok) {
          const p = await lookupIgProfile(tok, h);
          if (p && inBand(p.followers)) { picked.push({ platform, handle: p.username, display_name: p.name, avatar_url: p.avatar, followers: p.followers, reason: c.why }); continue; }
          if (p) { log("out of band", h, p.followers); continue; }
        }
      } catch (e: any) { log("verify error", h, e?.message); }
      // couldn't verify here: let the print itself verify (it fails cleanly if the account doesn't exist)
      unverified.push({ platform, handle: h, display_name: h, avatar_url: null, followers: null, reason: c.why });
    }
    for (const u of unverified) { if (picked.length >= 3) break; if (!picked.some((p) => p.handle.toLowerCase() === u.handle.toLowerCase())) picked.push(u); }
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
  if (rosterId) await sb.from("roster_creators").update({ neighborhood_at: new Date().toISOString() }).eq("id", rosterId);
  log(r.name, picked.length, "neighbors");
}
