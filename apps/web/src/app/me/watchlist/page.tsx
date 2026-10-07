import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { MyWatch } from "@/components/MyWatch";
import { LaneCards } from "@/components/LaneCards";
import { laneDigest, laneTopPosts } from "@/lib/lane-digest";

// The creator's lane: creators watched under them by the manager and by themselves.
export default async function MyWatchlist() {
  const { roster: r, preview } = await requireCreator();
  const admin = supabaseAdmin();
  const digest = await laneDigest(r.user_id, r.id, 30);
  const [all, talking] = await Promise.all([laneTopPosts(digest.rowIds, { limit: 24, days: 180 }), laneTopPosts(digest.rowIds, { limit: 24, days: 180, voiceOnly: true })]);
  const { data: watches } = await admin.from("watchlist").select("platform,handle,added_by,added_at").eq("user_id", r.user_id).eq("roster_creator_id", r.id).order("added_at", { ascending: false });
  const pairs = (watches || []).map((w) => `and(platform.eq.${w.platform},handle.ilike.${w.handle})`);
  const { data: creators } = pairs.length ? await admin.from("creators_slim").select("handle,platform,display_name,avatar_url,followers,category,performance").or(pairs.join(",")) : { data: [] };
  const rows = (watches || []).map((w) => { const c = (creators || []).find((x) => x.platform === w.platform && String(x.handle).toLowerCase() === String(w.handle).toLowerCase()); const perf = (c?.performance as any) || null; return { platform: w.platform, handle: w.handle, added_by: w.added_by, name: c?.display_name || w.handle, avatar: c?.avatar_url || null, followers: c?.followers || null, category: c?.category || null, top: perf?.top?.slice(0, 2).map((t: any) => ({ hook: t.spoken || t.on_video || t.on_screen || t.hook, metric: t.metric, url: t.url })) || [] }; });
  return (
    <div className="mx-auto max-w-5xl">
      {preview && <div className="mb-4 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-[12.5px]"><span>Previewing as <b>{r.name}</b>.</span><a href="/api/portal/preview?clear=1" className="num text-[11px] text-accent hover:underline">end preview</a></div>}
      <div className="mb-5"><div className="label mb-1">Your lane</div><h1 className="h1">What's working for creators like you</h1><p className="mt-1 text-[14px] text-muted">The best posts from the {rows.length} creator{rows.length === 1 ? "" : "s"} you and your team follow, ranked by how far each beat that creator's own numbers. The bold line is what a viewer hears or sees first.</p></div>
      <div className="mb-8"><LaneCards all={all} talking={talking} printHref sub="Last 180 days. Tap a card to watch the post; tap the name for their full print." /></div>
      <div className="mb-3"><div className="label mb-1">Who's in your lane</div><p className="text-[13px] text-muted">Add anyone you rate; your manager's picks are marked.</p></div>
      <MyWatch rows={rows} platform={r.platform === "youtube" ? "youtube" : "instagram"} />
    </div>
  );
}
