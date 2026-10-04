// Roster refresh. Once a day, for every roster creator: one cheap profile call
// (not a print) to update followers and the photo, keep a small avatar, and write
// a follower snapshot so 14/30-day growth is real. Instagram first; YouTube via
// the channel stats call. Skips when the pool is cooling.
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupIgProfile, IgRateLimitError } from "@creatorlens/engine";
import { houseIgToken } from "./neighborhood";
import { keepAvatar } from "./covers";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[roster]", ...a);
const YT_KEY = process.env.YOUTUBE_API_KEY || "";

export async function refreshRoster(sb: SupabaseClient): Promise<number> {
  const dayAgo = new Date(Date.now() - 22 * 3600e3).toISOString();
  const { data: roster } = await sb.from("roster_creators").select("id,name,handle,platform,followers,refreshed_at").or(`refreshed_at.is.null,refreshed_at.lt.${dayAgo}`).limit(40);
  if (!roster?.length) return 0;
  let n = 0;
  for (const r of roster) {
    const handle = String(r.handle || "").replace(/^@/, "").toLowerCase(); if (!handle) continue;
    try {
      let followers: number | null = null, avatar: string | null = null, displayName: string | null = null;
      if (r.platform === "youtube") {
        if (!YT_KEY) continue;
        const q = handle.startsWith("uc") && handle.length > 20 ? `id=${handle}` : `forHandle=${encodeURIComponent(handle)}`;
        const j: any = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&${q}&key=${YT_KEY}`)).json();
        const ch = j.items?.[0]; if (!ch) continue;
        followers = Number(ch.statistics?.subscriberCount || 0) || null; avatar = ch.snippet?.thumbnails?.medium?.url || ch.snippet?.thumbnails?.default?.url || null; displayName = ch.snippet?.title || null;
      } else {
        const tok = await houseIgToken(sb); if (!tok) { log("no Instagram token free; try later"); break; }
        const p = await lookupIgProfile(tok, handle); if (!p) continue;
        followers = p.followers || null; avatar = p.avatar; displayName = p.name;
      }
      await sb.from("roster_creators").update({ followers: followers ?? r.followers, avatar_url: avatar || undefined, refreshed_at: new Date().toISOString() }).eq("id", r.id);
      const { data: c } = await sb.from("creators").select("id").eq("platform", r.platform === "youtube" ? "youtube" : "instagram").ilike("handle", handle).maybeSingle();
      if (c) {
        await sb.from("creators").update({ followers: followers ?? undefined, avatar_url: avatar || undefined, display_name: displayName || undefined }).eq("id", c.id);
        await keepAvatar(sb, c.id, avatar);
        if (followers) await sb.from("performance_snapshots").insert({ creator_id: c.id, followers, items: 0, median: 0, metric_label: "followers", top: [], hooks: [], formats: [] });
      }
      n++;
    } catch (e: any) {
      if (e instanceof IgRateLimitError) { log("rate limited; resuming next hour"); break; }
      log(r.name, "refresh failed", String(e?.message || e).slice(0, 100));
    }
  }
  if (n) log("refreshed", n, "roster creators");
  return n;
}
