import { supabaseAdmin } from "@/lib/supabase";
import { hookShape } from "@creatorlens/engine";

export type LanePost = { creator: string; handle: string; platform: string; title: string; hook: string; on_screen: string | null; url: string; metric: number; metric_label: string; mult: number | null; rank: number; published_at: string; kind: string; sponsored: boolean };
export type LaneHook = {
  hook: string;
  posts: number;            // posts of this shape across the lane (all posts, not just the top 10)
  creators: number;         // how many lane creators use it
  mult: number | null;      // average multiple of each creator's OWN median, weighted by posts (size-neutral)
  avg: number;              // raw average engagement, kept for the tooltip
  examples: LanePost[];     // the best top-10 posts of this shape, with the line that was said when we have it
};
export type LaneCreator = {
  id: string; name: string; handle: string; platform: string; avatar: string | null;
  followers: number | null; growth30: number | null;   // followers delta over ~30 days, as a fraction (0.04 = +4%)
  median: number | null; metric_label: string | null; items: number | null;
  lastPrinted: string | null; added_by: string | null;
  leans: string | null;     // the hook shape they use most
};
export type LaneDigest = {
  since: string;
  creators: LaneCreator[];
  posts: LanePost[];
  hooks: LaneHook[];
  newBrands: { creator: string; brand: string; brand_id: string | null; when: string }[];
  note: string;             // one honest line about what the shapes are measured on
};

// "What's working in this creator's lane": the creators watched under them, their best
// recent posts relative to their own median, the hook shapes that recur (measured against
// each creator's own median so a 5M account and a 50K account count the same), and the
// brands any of them picked up. Computed live from the index; nothing to run.
export async function laneDigest(userId: string, rosterCreatorId: string, days = 30): Promise<LaneDigest> {
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - days * 864e5).toISOString();
  // the lane is shared across the org: watches filed under any teammate's row for the same creator count
  const { data: rr } = await admin.from("roster_creators").select("handle,name,user_id").eq("id", rosterCreatorId).single();
  const { data: owner } = rr ? await admin.from("profiles").select("org_id").eq("id", rr.user_id).single() : { data: null };
  const { data: mates } = owner?.org_id ? await admin.from("profiles").select("id").eq("org_id", owner.org_id) : { data: [{ id: userId }] };
  const memberIds = (mates || []).map((m) => m.id);
  const key = String(rr?.handle || rr?.name || "").replace(/^@/, "").toLowerCase();
  const { data: twins } = key ? await admin.from("roster_creators").select("id").in("user_id", memberIds).or(`handle.ilike.${key},handle.ilike.@${key},name.ilike.${key}`) : { data: [] };
  const rowIds = [...new Set([rosterCreatorId, ...(twins || []).map((t) => t.id)])];
  const { data: watches } = await admin.from("watchlist").select("platform,handle,added_by").in("user_id", memberIds).in("roster_creator_id", rowIds);
  const addedBy = new Map((watches || []).map((w) => [`${w.platform}:${String(w.handle).toLowerCase()}`, w.added_by as string]));
  const pairs = (watches || []).map((w) => `and(platform.eq.${w.platform},handle.ilike.${w.handle})`);
  const { data: creators } = pairs.length ? await admin.from("creators").select("id,handle,platform,display_name,avatar_url,followers,last_scanned_at,performance").or(pairs.join(",")) : { data: [] };

  // 30-day follower growth from the snapshots each print leaves behind
  const ids = (creators || []).map((c) => c.id);
  const { data: snaps } = ids.length ? await admin.from("performance_snapshots").select("creator_id,followers,captured_at").in("creator_id", ids).gte("captured_at", new Date(Date.now() - 45 * 864e5).toISOString()).not("followers", "is", null).order("captured_at", { ascending: true }) : { data: [] as any[] };
  const growth = new Map<string, number>();
  for (const id of ids) {
    const mine = (snaps || []).filter((s) => s.creator_id === id);
    const cur = (creators || []).find((c) => c.id === id)?.followers || mine.at(-1)?.followers;
    // the oldest snapshot at least 20 days back; fall back to the oldest we have if the gap is 7+ days
    const old = mine.find((s) => Date.now() - new Date(s.captured_at).getTime() >= 20 * 864e5) || (mine[0] && Date.now() - new Date(mine[0].captured_at).getTime() >= 7 * 864e5 ? mine[0] : null);
    if (cur && old?.followers) growth.set(id, (cur - old.followers) / old.followers);
  }

  const posts: LanePost[] = [];
  type Agg = { posts: number; sumMult: number; multPosts: number; sumAvg: number; creators: Set<string>; examples: LanePost[] };
  const agg = new Map<string, Agg>();
  const laneCreators: LaneCreator[] = [];
  for (const c of creators || []) {
    const perf = c.performance as any;
    const name = c.display_name || c.handle;
    const median = Number(perf?.median || 0);
    const hooks: { hook: string; count: number; avg: number }[] = (perf?.hooks || []).filter((h: any) => h.hook !== "Other");
    const lean = [...hooks].sort((a, b) => b.count - a.count)[0]?.hook || null;
    laneCreators.push({ id: c.id, name, handle: c.handle, platform: c.platform, avatar: c.avatar_url, followers: c.followers ?? null, growth30: growth.get(c.id) ?? null, median: median || null, metric_label: perf?.metric_label || null, items: perf?.items ?? null, lastPrinted: c.last_scanned_at || null, added_by: addedBy.get(`${c.platform}:${String(c.handle).toLowerCase()}`) || null, leans: lean });
    if (!perf?.top) continue;
    (perf.top as any[]).forEach((t, i) => {
      const p: LanePost = { creator: name, handle: c.handle, platform: c.platform, title: t.title, hook: t.hook, on_screen: t.spoken || t.on_video || t.on_screen || null, url: t.url, metric: t.metric, metric_label: perf.metric_label, mult: median >= 100 ? +(t.metric / median).toFixed(1) : null, rank: i + 1, published_at: t.published_at, kind: t.kind, sponsored: !!t.sponsored };
      if (String(t.published_at) >= since) posts.push(p);
      const shape = hookShape(t.title || t.hook || "");
      if (shape !== "Other") { const e = agg.get(shape) || agg.set(shape, { posts: 0, sumMult: 0, multPosts: 0, sumAvg: 0, creators: new Set(), examples: [] }).get(shape)!; e.examples.push(p); }
    });
    for (const h of hooks) {
      const e = agg.get(h.hook) || agg.set(h.hook, { posts: 0, sumMult: 0, multPosts: 0, sumAvg: 0, creators: new Set(), examples: [] }).get(h.hook)!;
      e.posts += h.count; e.sumAvg += h.avg * h.count; e.creators.add(c.id);
      if (median >= 100) { e.sumMult += (h.avg / median) * h.count; e.multPosts += h.count; }
    }
  }
  posts.sort((a, b) => (b.mult ?? 0) - (a.mult ?? 0) || b.metric - a.metric);
  const { data: ev } = await admin.from("watch_events").select("handle,new_brands,created_at").in("user_id", memberIds).in("roster_creator_id", rowIds).gte("created_at", since).order("created_at", { ascending: false }).limit(30);
  const nameOf = new Map((creators || []).map((c) => [String(c.handle).toLowerCase(), c.display_name || c.handle]));
  const newBrands = (ev || []).flatMap((e) => ((e.new_brands || []) as any[]).map((b) => ({ creator: nameOf.get(String(e.handle).toLowerCase()) || e.handle, brand: b.brand, brand_id: b.brand_id || null, when: e.created_at })));
  const hooksOut: LaneHook[] = [...agg.entries()].filter(([, v]) => v.posts > 0).map(([hook, v]) => ({
    hook, posts: v.posts, creators: v.creators.size,
    mult: v.multPosts ? +(v.sumMult / v.multPosts).toFixed(1) : null,
    avg: Math.round(v.sumAvg / v.posts),
    examples: v.examples.sort((a, b) => (b.mult ?? 0) - (a.mult ?? 0) || b.metric - a.metric).slice(0, 4),
  })).sort((a, b) => (b.mult ?? 0) - (a.mult ?? 0) || b.avg - a.avg).slice(0, 6);
  const total = laneCreators.reduce((s, c) => s + (c.items || 0), 0);
  const shaped = hooksOut.reduce((s, h) => s + h.posts, 0);
  return {
    since,
    creators: laneCreators.sort((a, b) => (b.followers || 0) - (a.followers || 0)),
    posts: posts.slice(0, 12),
    hooks: hooksOut,
    newBrands,
    note: total ? `Shapes are read from the first sentence of each caption, not the audio. ${shaped.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} posts across ${laneCreators.length} creators match a shape; the rest are unclassified. Each post is measured against its own creator's median, so account size doesn't tilt the bars.` : "",
  };
}
