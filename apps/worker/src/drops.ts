// Morning drop. For every user active in the last 14 days: work out their lane
// (categories of their roster creators), pick three printed creators in those
// categories they haven't unlocked yet (newest prints first, discovered ones
// preferred), unlock them, and leave them on the home page with a reason.
// When the index is thin for a lane, seed a neighborhood for one of their
// roster creators so tomorrow's drop has something new.
import type { SupabaseClient } from "@supabase/supabase-js";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[drops]", ...a);
const PER_USER = Number(process.env.DROP_PER_USER || 3);
const MAX_USERS = Number(process.env.DROP_MAX_USERS || 200);

export async function morningDrops(sb: SupabaseClient): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data: users } = await sb.from("profiles").select("id,plan").gte("last_seen_at", since).limit(MAX_USERS);
  let made = 0;
  for (const u of users || []) {
    const { data: done } = await sb.from("drops").select("day").eq("user_id", u.id).eq("day", day).maybeSingle();
    if (done) continue;
    const { data: roster } = await sb.from("roster_creators").select("id,handle,platform,niche").eq("user_id", u.id);
    if (!roster?.length) continue;
    // lane = categories of roster creators as printed, falling back to niche words
    const cats = new Set<string>();
    for (const r of roster) {
      const { data: c } = await sb.from("creators").select("category").eq("platform", r.platform === "youtube" ? "youtube" : "instagram").ilike("handle", String(r.handle || "").replace(/^@/, "")).maybeSingle();
      if (c?.category) cats.add(c.category);
    }
    if (!cats.size) { await seed(sb, u.id, roster[0].id); continue; }
    const { data: unlocked } = await sb.from("creator_access").select("platform,handle").eq("user_id", u.id);
    const have = new Set((unlocked || []).map((a) => `${a.platform}:${a.handle.toLowerCase()}`));
    const { data: pool } = await sb.from("creators").select("id,platform,handle,external_id,category,discovered_at,last_scanned_at,followers").in("category", [...cats]).not("last_scanned_at", "is", null).order("last_scanned_at", { ascending: false }).limit(120);
    const fresh = (pool || []).filter((c) => !have.has(`${c.platform}:${c.handle.toLowerCase()}`) && !(c.external_id && have.has(`${c.platform}:${String(c.external_id).toLowerCase()}`)));
    fresh.sort((a, b) => Number(!!b.discovered_at) - Number(!!a.discovered_at) || String(b.last_scanned_at).localeCompare(String(a.last_scanned_at)));
    const picks = fresh.slice(0, PER_USER);
    if (picks.length < PER_USER) await seed(sb, u.id, roster[Math.floor(Math.random() * roster.length)].id);
    if (!picks.length) continue;
    for (const p of picks) {
      await sb.from("creator_access").upsert({ user_id: u.id, platform: p.platform, handle: p.handle.toLowerCase() }, { onConflict: "user_id,platform,handle", ignoreDuplicates: true });
      if (p.external_id) await sb.from("creator_access").upsert({ user_id: u.id, platform: p.platform, handle: String(p.external_id).toLowerCase() }, { onConflict: "user_id,platform,handle", ignoreDuplicates: true });
    }
    await sb.from("drops").insert({ user_id: u.id, day, items: picks.map((p) => ({ creator_id: p.id, reason: `${p.category} · in the lane of your roster` })) });
    made++;
  }
  log("drops made for", made, "users");
  return made;
}

async function seed(sb: SupabaseClient, userId: string, rosterId: string) {
  const { data: recent } = await sb.from("neighborhoods").select("id").eq("roster_creator_id", rosterId).gte("created_at", new Date(Date.now() - 3 * 864e5).toISOString()).limit(1);
  if (recent?.length) return;
  await sb.from("neighborhoods").insert({ user_id: userId, roster_creator_id: rosterId });
}
