import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { MyWatch } from "@/components/MyWatch";
import { LaneCards } from "@/components/LaneCards";
import { LaneBrief } from "@/components/LaneBrief";
import { cleanLine } from "@/lib/clean-text";
import { laneDigest, laneTopPosts } from "@/lib/lane-digest";
import { laneBrief, fitBand } from "@/lib/lane-brief";

// The creator's lane: a brief first (what to try, where the lane is going, your own best), then the
// evidence (the lane's best posts), then the list of who's in it. Follow box stays on top.
export default async function MyWatchlist() {
  const { roster: r, preview } = await requireCreator();
  const admin = supabaseAdmin();
  const platform = r.platform === "youtube" ? "youtube" : "instagram";
  const { data: me } = await admin.from("creators").select("id,followers,performance").eq("platform", platform).ilike("handle", String(r.handle || "").replace(/^@/, "")).maybeSingle();
  const band = fitBand(me?.followers || r.followers);
  const digest = await laneDigest(r.user_id, r.id, 30, { fit: band });
  const [all, talking] = await Promise.all([laneTopPosts(digest.rowIds, { limit: 48, days: 180 }), laneTopPosts(digest.rowIds, { limit: 48, days: 180, voiceOnly: true })]);
  const brief = laneBrief(digest, all, { performance: me?.performance || null });
  const [{ data: watches }, { data: mutes }] = await Promise.all([
    admin.from("watchlist").select("platform,handle,added_by,added_at").eq("user_id", r.user_id).eq("roster_creator_id", r.id).order("added_at", { ascending: false }),
    admin.from("lane_mutes").select("platform,handle").eq("roster_creator_id", r.id),
  ]);
  const muted = new Set((mutes || []).map((m) => `${m.platform}:${String(m.handle).toLowerCase()}`));
  const pairs = (watches || []).map((w) => `and(platform.eq.${w.platform},handle.ilike.${w.handle})`);
  const { data: creators } = pairs.length ? await admin.from("creators_slim").select("handle,platform,display_name,avatar_url,followers,category,performance").or(pairs.join(",")) : { data: [] };
  const rows = (watches || []).map((w) => { const c = (creators || []).find((x) => x.platform === w.platform && String(x.handle).toLowerCase() === String(w.handle).toLowerCase()); const perf = (c?.performance as any) || null; return { platform: w.platform, handle: w.handle, added_by: w.added_by, muted: muted.has(`${w.platform}:${String(w.handle).toLowerCase()}`), name: c?.display_name || w.handle, avatar: c?.avatar_url || null, followers: c?.followers || null, category: c?.category || null, top: perf?.top?.slice(0, 2).map((t: any) => ({ hook: cleanLine(t.spoken || t.on_video || t.on_screen || t.hook), metric: t.metric, url: t.url })) || [] }; });
  return (
    <div className="mx-auto max-w-5xl">
      {preview && <div className="mb-4 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-[12.5px]"><span>Previewing as <b>{r.name}</b>.</span><a href="/api/portal/preview?clear=1" className="num text-[11px] text-accent hover:underline">end preview</a></div>}
      <div className="mb-5"><div className="label mb-1">Your lane</div><h1 className="h1">What your lane says to do this week</h1><p className="mt-1 text-[14px] text-muted">Counted from the creators you and your team follow: the openings they're being rewarded for that you haven't tried, the subjects they're covering that you aren't, and their best posts as proof. Follow anyone, remove anyone.</p></div>
      <MyWatch rows={rows} platform={platform}>
        <LaneBrief brief={brief} first={r.name.split(" ")[0]} laneSize={digest.creators.length} />
        <div className="mt-8">
          <LaneCards all={all} talking={talking} printHref fit={band} limit={24} title="The proof: best in your lane" sub={`Last 180 days, ranked by how far each post beat its own creator's median. ${band ? `"My size" keeps it to accounts near yours.` : ""} Tap a card for the post; the name for their full print.`} />
        </div>
      </MyWatch>
    </div>
  );
}
