import { supabaseAdmin } from "@/lib/supabase";

export type LaneDigest = {
  since: string;
  creators: { id: string; name: string; handle: string; platform: string; avatar: string | null }[];
  posts: { creator: string; handle: string; platform: string; title: string; hook: string; on_screen: string | null; url: string; metric: number; metric_label: string; mult: number | null; rank: number; published_at: string; kind: string; sponsored: boolean }[];
  hooks: { hook: string; count: number; avg: number }[];
  newBrands: { creator: string; brand: string; brand_id: string | null; when: string }[];
};

// "What's working in this creator's lane": the creators watched under them (plus
// the seed's co-sponsor neighbors already in the index), their best recent posts
// relative to their own median, the hook shapes that recur, and the brands any of
// them picked up. Computed live from the index; nothing to run.
export async function laneDigest(userId: string, rosterCreatorId: string, days = 30): Promise<LaneDigest> {
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data: watches } = await admin.from("watchlist").select("platform,handle").eq("user_id", userId).eq("roster_creator_id", rosterCreatorId);
  const pairs = (watches || []).map((w) => `and(platform.eq.${w.platform},handle.ilike.${w.handle})`);
  const { data: creators } = pairs.length ? await admin.from("creators").select("id,handle,platform,display_name,avatar_url,performance").or(pairs.join(",")) : { data: [] };
  const posts: LaneDigest["posts"] = [];
  const hookAgg = new Map<string, { count: number; sum: number }>();
  for (const c of creators || []) {
    const perf = c.performance as any; if (!perf?.top) continue;
    const name = c.display_name || c.handle;
    (perf.top as any[]).forEach((t, i) => {
      if (String(t.published_at) < since) return;
      posts.push({ creator: name, handle: c.handle, platform: c.platform, title: t.title, hook: t.hook, on_screen: t.on_screen || null, url: t.url, metric: t.metric, metric_label: perf.metric_label, mult: perf.median >= 1000 ? +(t.metric / perf.median).toFixed(1) : null, rank: i + 1, published_at: t.published_at, kind: t.kind, sponsored: !!t.sponsored });
    });
    for (const h of (perf.hooks || []) as any[]) { if (h.hook === "Other") continue; const e = hookAgg.get(h.hook) || hookAgg.set(h.hook, { count: 0, sum: 0 }).get(h.hook)!; e.count += h.count; e.sum += h.avg * h.count; }
  }
  posts.sort((a, b) => (b.mult ?? 0) - (a.mult ?? 0) || b.metric - a.metric);
  const { data: ev } = await admin.from("watch_events").select("handle,new_brands,created_at").eq("user_id", userId).eq("roster_creator_id", rosterCreatorId).gte("created_at", since).order("created_at", { ascending: false }).limit(30);
  const nameOf = new Map((creators || []).map((c) => [String(c.handle).toLowerCase(), c.display_name || c.handle]));
  const newBrands = (ev || []).flatMap((e) => ((e.new_brands || []) as any[]).map((b) => ({ creator: nameOf.get(String(e.handle).toLowerCase()) || e.handle, brand: b.brand, brand_id: b.brand_id || null, when: e.created_at })));
  return {
    since,
    creators: (creators || []).map((c) => ({ id: c.id, name: c.display_name || c.handle, handle: c.handle, platform: c.platform, avatar: c.avatar_url })),
    posts: posts.slice(0, 12),
    hooks: [...hookAgg.entries()].map(([hook, v]) => ({ hook, count: v.count, avg: Math.round(v.sum / v.count) })).sort((a, b) => b.avg - a.avg).slice(0, 5),
    newBrands,
  };
}
