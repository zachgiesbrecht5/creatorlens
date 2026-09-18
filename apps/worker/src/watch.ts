// Watchlist keeper. Runs with the nightly job: for every watched creator,
// (1) diff the brands on their print against what the watcher last saw and
// log the new ones, (2) if the print is older than 7 days, queue a fresh one
// (free, source=watchlist). New brands from that re-print get logged the
// next night, so a weekly cadence surfaces as "3 new deals on your watchlist".
import type { SupabaseClient } from "@supabase/supabase-js";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[watch]", ...a);
const WEEK = 7 * 864e5;

export async function keepWatch(sb: SupabaseClient): Promise<number> {
  const { data: watches } = await sb.from("watchlist").select("user_id,platform,handle,known_brands");
  let events = 0, queued = 0;
  for (const w of watches || []) {
    const { data: c } = await sb.from("creators").select("id,last_scanned_at").eq("platform", w.platform).ilike("handle", w.handle).maybeSingle();
    if (c) {
      const { data: wall } = await sb.from("brand_wall").select("brand_id,brand,deals").eq("creator_id", c.id).eq("is_junk", false).eq("is_self_brand", false);
      const known = new Set((w.known_brands || []) as string[]);
      const fresh = (wall || []).filter((b) => !known.has(b.brand));
      if (fresh.length && known.size > 0) {   // first check just baselines
        await sb.from("watch_events").insert({ user_id: w.user_id, platform: w.platform, handle: w.handle, new_brands: fresh.map((b) => ({ brand: b.brand, brand_id: b.brand_id, deals: b.deals })) });
        events++;
      }
      await sb.from("watchlist").update({ known_brands: (wall || []).map((b) => b.brand), last_checked_at: new Date().toISOString() }).eq("user_id", w.user_id).eq("platform", w.platform).eq("handle", w.handle);
    }
    const stale = !c?.last_scanned_at || Date.now() - new Date(c.last_scanned_at).getTime() > WEEK;
    if (stale) {
      const { data: existing } = await sb.from("scan_jobs").select("id").eq("platform", w.platform).ilike("handle", w.handle).in("status", ["queued", "running", "rate_limited"]).limit(1);
      if (!existing?.length) { await sb.from("scan_jobs").insert({ user_id: w.user_id, platform: w.platform, handle: w.handle, priority: 6, source: "watchlist" }); queued++; }
    }
  }
  log((watches || []).length, "watched,", events, "events,", queued, "re-prints queued");
  return (watches || []).length;
}
