import Link from "next/link";
import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { laneDigest, laneTopPosts } from "@/lib/lane-digest";
import { fitBand } from "@/lib/lane-brief";
import { Feed, type FeedItem } from "@/components/Feed";

// The lane as a feed, built for a phone: one post per screen, the opening and the multiple first.
// Lane posts near the creator's size, with their own top posts dropped in every seventh slot so the
// comparison is always one swipe away.
const fmtK = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));
function srcOf(t: any): FeedItem["src"] {
  if (t.audio === "voice" && t.spoken) return "SAID";
  if (t.on_video) return "ON VIDEO";
  if (t.on_screen) return "ON COVER";
  if (t.audio === "sound") return "TRENDING SOUND";
  if (t.audio === "music") return "MUSIC";
  return "CAPTION";
}
const lineOf = (t: any) => String(t.spoken && t.audio === "voice" ? t.spoken : t.on_video || t.on_screen || t.hook || t.title || "");
function whyOf(src: FeedItem["src"], mult: number | null, you: boolean, kind: string | null, median: number | null, label: string): string {
  const who = you ? "your" : "their";
  const open = src === "SAID" ? "Opens with a spoken line, so the first second does the work with no text on screen." : src === "ON VIDEO" ? "Opens with text on the video; the line is readable before the sound is on." : src === "ON COVER" ? "The cover carries the line, so it reads in the grid before anyone taps." : src === "TRENDING SOUND" ? "Rides a trending sound rather than a spoken opener; the reach came from the audio." : "No spoken opener; the caption carries it.";
  const num = mult ? `${mult}x ${who} median of ${fmtK(median)} ${label}.` : `Top post for ${you ? "you" : "them"} in the window.`;
  return `${num} ${open}${kind ? ` ${kind.charAt(0).toUpperCase() + kind.slice(1)}.` : ""}`;
}

export default async function MyFeed() {
  const { roster: r, preview } = await requireCreator();
  const admin = supabaseAdmin();
  const platform = r.platform === "youtube" ? "youtube" : "instagram";
  const { data: me } = await admin.from("creators").select("id,handle,display_name,avatar_url,followers,performance").eq("platform", platform).ilike("handle", String(r.handle || "").replace(/^@/, "")).maybeSingle();
  const band = fitBand(me?.followers || r.followers);
  const digest = await laneDigest(r.user_id, r.id, 30, { fit: band });
  const lane = (await laneTopPosts(digest.rowIds, { limit: 60, days: 180 })).filter((p) => !band || !p.followers || (p.followers >= band.min && p.followers <= band.max)).slice(0, 36);
  const perf: any = me?.performance || null;
  const median = Number(perf?.median || 0) || null;
  const own: FeedItem[] = ((perf?.top || []) as any[]).slice(0, 5).map((t, i) => { const src = srcOf(t); const mult = median ? +(Number(t.metric) / median).toFixed(1) : null; return { key: `you:${t.url}`, url: t.url, thumb: t.thumb || null, line: lineOf(t), src, metric: Number(t.metric || 0), metric_label: perf?.metric_label || "engagement", mult, published_at: t.published_at || null, sponsored: !!t.sponsored, creator: r.name, handle: String(r.handle || "").replace(/^@/, ""), platform, avatar: me?.avatar_url || r.avatar_url || null, followers: me?.followers || r.followers || null, you: true, why: whyOf(src, mult, true, t.kind || null, median, perf?.metric_label || "engagement") }; });
  const laneItems: FeedItem[] = lane.map((p) => { const t = p.post; const src = srcOf(t); return { key: `${p.creator_id}:${t.url}`, url: t.url, thumb: t.thumb || null, line: lineOf(t), src, metric: Number(t.metric || 0), metric_label: p.metric_label || "engagement", mult: p.mult != null ? Number(p.mult) : null, published_at: t.published_at || null, sponsored: !!t.sponsored, creator: p.display_name, handle: p.handle, platform: p.platform, avatar: p.avatar_url, followers: p.followers, you: false, why: whyOf(src, p.mult != null ? Number(p.mult) : null, false, t.kind || null, p.median != null ? Number(p.median) : null, p.metric_label || "engagement") }; });
  // interleave: own best every 7th slot, starting at the 3rd
  const items: FeedItem[] = []; let o = 0;
  laneItems.forEach((it, idx) => { items.push(it); if ((idx + 1) % 6 === 2 && own[o]) items.push(own[o++]); });
  while (o < own.length && items.length) items.push(own[o++]);
  return (
    <div className="mx-auto max-w-md">
      {preview && <div className="mb-3 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-[12.5px]"><span>Previewing as <b>{r.name}</b>.</span><a href="/api/portal/preview?clear=1" className="num text-[11px] text-accent hover:underline">end preview</a></div>}
      <div className="mb-3 flex items-end justify-between gap-3"><div><div className="label mb-0.5">Feed</div><h1 className="text-[17px] font-semibold tracking-tight">Your lane, one post at a time</h1></div><Link href="/me/watchlist" className="num text-[11px] text-accent hover:underline">the brief →</Link></div>
      <Feed items={items} first={r.name.split(" ")[0]} />
    </div>
  );
}
