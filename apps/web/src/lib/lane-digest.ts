import { supabaseAdmin } from "@/lib/supabase";
import { hookShape, openerKey } from "@creatorlens/engine";

export type LanePost = { creator: string; handle: string; platform: string; title: string; hook: string; on_screen: string | null; url: string; metric: number; metric_label: string; mult: number | null; rank: number; published_at: string; kind: string; sponsored: boolean };
export type LaneHook = {
  hook: string;
  posts: number;            // posts of this shape across the lane (all posts, not just the top 10)
  creators: number;         // how many lane creators use it
  mult: number | null;      // average multiple of each creator's OWN median, weighted by posts (size-neutral)
  avg: number;              // raw average engagement, kept for the tooltip
  examples: LanePost[];     // the best top-10 posts of this shape, with the line that was said when we have it
};
export type LaneOpener = {
  key: string; label: string;      // the most common literal opening line in the group, the creator's own words
  posts: number; creators: number;
  mult: number | null;             // average multiple of each creator's own median, weighted by posts
  avg: number;
  said: boolean;                   // true when the group's key comes from a spoken line, not a caption
  examples: LanePost[];
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
  rowIds: string[];         // this creator's roster rows across the org (the lane is shared)
  creators: LaneCreator[];
  posts: LanePost[];
  hooks: LaneHook[];
  openers: LaneOpener[];
  newBrands: { creator: string; brand: string; brand_id: string | null; when: string }[];
  note: string;             // one honest line about what the shapes are measured on
};

// Reads creators_slim (performance without base64 thumbnails): a lane of 130 creators is ~0.5 MB
// instead of 13 MB, which is the difference between a page and a timeout.
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
  const { data: creators } = pairs.length ? await admin.from("creators_slim").select("id,handle,platform,display_name,avatar_url,followers,last_scanned_at,performance").or(pairs.join(",")) : { data: [] };

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
  type OAgg = { posts: number; sumMult: number; multPosts: number; sumAvg: number; creators: Set<string>; labels: Map<string, number>; said: number; examples: LanePost[] };
  const oagg = new Map<string, OAgg>();
  const oget = (k: string) => oagg.get(k) || oagg.set(k, { posts: 0, sumMult: 0, multPosts: 0, sumAvg: 0, creators: new Set(), labels: new Map(), said: 0, examples: [] }).get(k)!;
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
    // openings in the creator's own words: every repeated caption opener from the whole print...
    for (const o of (perf.openers || []) as any[]) {
      const e = oget(o.key); e.posts += o.count; e.sumAvg += o.avg * o.count; e.creators.add(c.id);
      e.labels.set(o.label, (e.labels.get(o.label) || 0) + o.count);
      if (median >= 100) { e.sumMult += (o.avg / median) * o.count; e.multPosts += o.count; }
    }
    (perf.top as any[]).forEach((t, i) => {
      const p: LanePost = { creator: name, handle: c.handle, platform: c.platform, title: t.title, hook: t.hook, on_screen: t.spoken || t.on_video || t.on_screen || null, url: t.url, metric: t.metric, metric_label: perf.metric_label, mult: median >= 100 ? +(t.metric / median).toFixed(1) : null, rank: i + 1, published_at: t.published_at, kind: t.kind, sponsored: !!t.sponsored };
      if (String(t.published_at) >= since) posts.push(p);
      // ...and the spoken openings of the top posts, which the captions can't tell us
      const line = t.audio === "voice" && t.spoken ? t.spoken : (t.on_video || t.hook || "");
      const ok = openerKey(line);
      if (ok.split(" ").length >= 2) {
        const e = oget(ok); e.examples.push(p); if (t.audio === "voice" && t.spoken) e.said++;
        if (!(perf.openers || []).some((o: any) => o.key === ok)) { e.posts += 1; e.sumAvg += t.metric; e.creators.add(c.id); e.labels.set(String(line).replace(/\s+/g, " ").trim().slice(0, 90), (e.labels.get(line) || 0) + 1); if (median >= 100) { e.sumMult += (t.metric / median); e.multPosts += 1; } }
      }
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
  const openersOut: LaneOpener[] = [...oagg.entries()].filter(([, v]) => v.posts >= 2).map(([key, v]) => ({
    key, label: [...v.labels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || key, posts: v.posts, creators: v.creators.size,
    mult: v.multPosts ? +(v.sumMult / v.multPosts).toFixed(1) : null, avg: Math.round(v.sumAvg / Math.max(1, v.posts)), said: v.said > 0,
    examples: v.examples.sort((a, b) => (b.mult ?? 0) - (a.mult ?? 0) || b.metric - a.metric).slice(0, 4),
  })).sort((a, b) => (b.mult ?? 0) - (a.mult ?? 0) || b.posts - a.posts).slice(0, 8);
  const total = laneCreators.reduce((s, c) => s + (c.items || 0), 0);
  return {
    since,
    rowIds,
    creators: laneCreators.sort((a, b) => (b.followers || 0) - (a.followers || 0)),
    posts: posts.slice(0, 12),
    hooks: hooksOut,
    openers: openersOut,
    newBrands,
    note: total ? `Openings are grouped by the first words actually said (top posts with audio) or written in the caption (all ${total.toLocaleString("en-US")} posts across ${laneCreators.length} creators). Only openings used more than once appear. Each post is measured against its own creator's median, so account size doesn't tilt the bars.` : "",
  };
}


export type LaneTopPost = { creator_id: string; handle: string; platform: string; display_name: string; avatar_url: string | null; followers: number | null; median: number | null; metric_label: string | null; mult: number | null; score: number; post: any };

/** The lane's best posts as cards (thumbnails kept, CDN links dropped), ranked by a blend of size and
 *  how far each beat its own creator's median (capped at 100x). One RPC, no 13 MB JSON. */
export async function laneTopPosts(rowIds: string[], opts: { limit?: number; days?: number; voiceOnly?: boolean } = {}): Promise<LaneTopPost[]> {
  if (!rowIds.length) return [];
  const { data, error } = await supabaseAdmin().rpc("lane_top_posts", { p_roster_ids: rowIds, p_limit: opts.limit ?? 24, p_days: opts.days ?? 365, p_voice_only: !!opts.voiceOnly });
  if (error) { console.warn("lane_top_posts failed", error.message); return []; }
  return (data || []) as LaneTopPost[];
}
