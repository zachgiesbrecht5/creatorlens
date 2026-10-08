import Link from "next/link";
import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { Spark } from "@/components/Spark";
import { cleanLine } from "@/lib/clean-text";
import { myCreator, history, fmtK, dShort } from "@/lib/me-stats";
import { lanesFor, placePost, JOB_LABEL, type Lane } from "@/lib/lanes";

// Engagement tile -> page, in the shape of the quarterly read's appendix: the posts sorted into the lanes the
// creator and manager agreed on, with share of views, share of follows and follows per 10K views when the
// account's own insights are connected, and public engagement when they aren't.
type Row = { url: string; text: string; posted_at: string | null; sponsored: boolean; lane: Lane; views: number | null; follows: number | null; saves: number | null; shares: number | null; comments: number | null; metric: number; src: string; kind: string | null };

export default async function MyEngagement({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { roster: r, preview } = await requireCreator();
  const sp = await searchParams;
  const days = [14, 30, 60, 90].includes(Number(sp.days)) ? Number(sp.days) : 90;
  const admin = supabaseAdmin();
  const platform = r.platform === "youtube" ? "youtube" : "instagram";
  const me = await myCreator(platform, r.handle || "");
  const perf: any = me?.performance || null;
  const lanes = lanesFor((r as any).content_lanes);
  const [{ data: owned }, { data: overrides }, hist] = await Promise.all([
    me ? admin.from("owned_post_insights").select("permalink,posted_at,media_type,caption,likes,comments,saves,shares,reach,views,follows,total_interactions").eq("creator_id", me.id).gte("posted_at", new Date(Date.now() - days * 864e5).toISOString()).order("posted_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] as any[] }),
    admin.from("post_lane_overrides").select("url,lane").eq("roster_creator_id", r.id),
    me ? history(me.id, 180) : Promise.resolve([] as any[]),
  ]);
  const ov = new Map((overrides || []).map((o) => [o.url, o.lane]));
  const hasOwned = !!owned?.length;
  const median = Number(perf?.median || 0);
  const topByUrl = new Map<string, any>(((perf?.top || []) as any[]).map((t) => [t.url, t]));
  const lineOf = (t: any) => String(t?.spoken && t.audio === "voice" ? t.spoken : t?.on_video || t?.on_screen || t?.hook || t?.title || "");

  // every post we can see: owned insights (90 days, all posts) or the public print's top 10
  const rows: Row[] = hasOwned
    ? (owned || []).map((o) => { const t = topByUrl.get(o.permalink); const text = [lineOf(t), o.caption].filter(Boolean).join(" \n "); const sponsored = !!t?.sponsored || /#ad\b|paid partnership|#sponsored/i.test(o.caption || ""); return { url: o.permalink, text, posted_at: o.posted_at, sponsored, lane: placePost(text, sponsored, lanes, ov.get(o.permalink)), views: o.views ?? o.reach ?? null, follows: o.follows ?? null, saves: o.saves, shares: o.shares, comments: o.comments, metric: Number(o.total_interactions ?? ((o.likes || 0) + (o.comments || 0))), src: t ? (t.audio === "voice" && t.spoken ? "said" : t.on_video ? "on video" : "caption") : "caption", kind: o.media_type ? String(o.media_type).toLowerCase().replace("reels", "reel").replace("feed", "post") : null }; })
    : ((perf?.top || []) as any[]).filter((t) => !t.published_at || new Date(t.published_at).getTime() >= Date.now() - days * 864e5).map((t) => { const text = lineOf(t); return { url: t.url, text, posted_at: t.published_at || null, sponsored: !!t.sponsored, lane: placePost(text, !!t.sponsored, lanes, ov.get(t.url)), views: null, follows: null, saves: null, shares: null, comments: null, metric: Number(t.metric || 0), src: t.audio === "voice" && t.spoken ? "said" : t.on_video ? "on video" : "caption", kind: t.kind || null }; });

  const sum = (a: (number | null)[]) => a.reduce((s: number, n) => s + (n || 0), 0);
  const totalViews = sum(rows.map((x) => x.views)), totalFollows = sum(rows.map((x) => x.follows)), totalMetric = sum(rows.map((x) => x.metric));
  const byLane = lanes.map((l) => { const ps = rows.filter((x) => x.lane.key === l.key); const v = sum(ps.map((x) => x.views)), f = sum(ps.map((x) => x.follows)), m = sum(ps.map((x) => x.metric)); return { lane: l, posts: ps, views: v, follows: f, metric: m, shareViews: totalViews ? v / totalViews : null, shareFollows: totalFollows ? f / totalFollows : null, shareMetric: totalMetric ? m / totalMetric : null, fPer10k: v ? (f / v) * 10000 : null, savesPer1k: v ? ((sum(ps.map((x) => x.saves)) + sum(ps.map((x) => x.shares))) / v) * 1000 : null }; }).filter((b) => b.posts.length).sort((a, b) => (hasOwned ? (b.fPer10k ?? -1) - (a.fPer10k ?? -1) : b.metric - a.metric));
  const pct = (n: number | null) => (n == null ? "" : `${Math.round(n * 100)}%`);
  const since = rows.length ? dShort(rows[rows.length - 1].posted_at) : "";
  const typical = hasOwned ? Math.round(sum(rows.map((x) => x.views)) / Math.max(1, rows.filter((x) => x.views != null).length)) : median;
  const avgF = totalViews ? (totalFollows / totalViews) * 10000 : null;

  return (
    <div className="mx-auto max-w-5xl">
      {preview && <div className="mb-4 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-[12.5px]"><span>Previewing as <b>{r.name}</b>.</span><a href="/api/portal/preview?clear=1" className="num text-[11px] text-accent hover:underline">end preview</a></div>}
      <div className="mb-5"><div className="label mb-1"><Link href="/me" className="hover:text-accent">Home</Link> · what your posts do</div>
        <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="h1">{hasOwned ? `${rows.length} posts, ${since} to today` : `A typical post gets ${fmtK(median)} likes and comments`}</h1><div className="seg">{[14, 30, 60, 90].map((v) => <Link key={v} href={`/me/engagement?days=${v}`} className={days === v ? "on" : ""}>{v}d</Link>)}</div></div>
        <p className="mt-1 text-[14px] text-muted">{hasOwned ? `Read from your own account: views, follows, saves and shares per post. Each post is placed in one of the ${lanes.length} lanes you and your manager agreed on, so a lane is judged by the job it's meant to do, not by one number for everything.` : `Half your last ${perf?.items || 250} posts did better than this, half did worse; it's what a brand should expect, not the average that one viral reel drags upward. Connect your Instagram and this page switches to views, follows, saves and shares from your own account.`}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {hasOwned ? <>
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Views</div><div className="mt-1 text-[22px] font-bold">{fmtK(totalViews)}</div><div className="num text-[10.5px] text-dim">avg {fmtK(typical)} per post</div></div>
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">New follows from posts</div><div className="mt-1 text-[22px] font-bold">{fmtK(totalFollows)}</div><div className="num text-[10.5px] text-dim">{avgF != null ? `${avgF.toFixed(1)} per 10K views` : ""}</div></div>
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Saves + shares</div><div className="mt-1 text-[22px] font-bold">{fmtK(sum(rows.map((x) => x.saves)) + sum(rows.map((x) => x.shares)))}</div><div className="num text-[10.5px] text-dim">{totalViews ? `${(((sum(rows.map((x) => x.saves)) + sum(rows.map((x) => x.shares))) / totalViews) * 1000).toFixed(1)} per 1K views` : ""}</div></div>
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Best lane for follows</div><div className="mt-1 truncate text-[16px] font-bold">{byLane[0]?.lane.label || "—"}</div><div className="num text-[10.5px] text-dim">{byLane[0]?.fPer10k != null ? `${byLane[0].fPer10k.toFixed(1)} follows per 10K views` : ""}</div></div>
        </> : <>
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Typical post</div><div className="mt-1 text-[22px] font-bold">{fmtK(median)}</div><div className="num text-[10.5px] text-dim">likes + comments · {perf?.items || 0} posts</div></div>
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Your top 10, on average</div><div className="mt-1 text-[22px] font-bold">{fmtK(rows.length ? totalMetric / rows.length : 0)}</div><div className="num text-[10.5px] text-dim">{median ? `${Math.round(totalMetric / rows.length / median)} times a typical post` : ""}</div></div>
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Top 10 that open talking</div><div className="mt-1 text-[22px] font-bold">{rows.filter((x) => x.src === "said").length}<span className="text-[13px] font-normal text-muted"> / {rows.length}</span></div><div className="num text-[10.5px] text-dim">a spoken first line</div></div>
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Best lane in your top 10</div><div className="mt-1 truncate text-[16px] font-bold">{byLane[0]?.lane.label || "—"}</div><div className="num text-[10.5px] text-dim">{byLane[0] ? `${byLane[0].posts.length} of your top ${rows.length}` : ""}</div></div>
        </>}
      </div>

      <div className="card mt-4 overflow-x-auto p-5">
        <div className="label mb-1">By lane</div>
        <p className="mb-3 text-[13px] text-muted">{hasOwned ? "Share of views says what gets seen; share of follows says what builds the account; follows per 10K views is the fair comparison between lanes of different sizes. Each lane's job is beside it: judge it by that." : `From your public top 10 (those posted in the last ${days} days) until your Instagram is connected; share is of their likes and comments.`}</p>
        <table className="tbl">
          <thead><tr><th>Lane</th><th>Job</th><th className="text-right">Posts</th>{hasOwned ? <><th className="text-right">Share of views</th><th className="text-right">Share of follows</th><th className="text-right">Follows / 10K views</th><th className="text-right">Saves + shares / 1K</th></> : <><th className="text-right">Share of top-10 engagement</th><th className="text-right">Avg</th></>}</tr></thead>
          <tbody>{byLane.map((b, i) => (
            <tr key={b.lane.key} className={i === 0 ? "font-semibold" : ""}><td>{b.lane.label}</td><td className="num text-[11px] text-muted">{JOB_LABEL[b.lane.job]}</td><td className="num text-right">{b.posts.length}</td>
              {hasOwned ? <><td className="num text-right">{pct(b.shareViews)}</td><td className="num text-right">{pct(b.shareFollows)}</td><td className={`num text-right ${avgF != null && (b.fPer10k ?? 0) >= avgF ? "text-ok" : ""}`}>{b.fPer10k != null ? b.fPer10k.toFixed(1) : ""}</td><td className="num text-right">{b.savesPer1k != null ? b.savesPer1k.toFixed(1) : ""}</td></>
                : <><td className="num text-right">{pct(b.shareMetric)}</td><td className="num text-right">{fmtK(b.metric / b.posts.length)}</td></>}
            </tr>))}</tbody>
        </table>
        {hasOwned && byLane[0] && byLane[0].posts.length <= 2 && <div className="num mt-2 text-[10.5px] text-dim">The top lane rests on {byLane[0].posts.length} post{byLane[0].posts.length === 1 ? "" : "s"}; treat its rate as a hint, not a verdict.</div>}
      </div>

      <div className="mt-4 space-y-3">
        {byLane.map((b) => (
          <details key={b.lane.key} className="card p-5" open={b === byLane[0]}>
            <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2"><span className="text-[15px] font-semibold">{b.lane.label} <span className="num text-[11px] font-normal text-muted">· {b.posts.length} post{b.posts.length === 1 ? "" : "s"} · {JOB_LABEL[b.lane.job]}</span></span>{hasOwned && b.fPer10k != null && <span className="num text-[12px] text-muted">{b.fPer10k.toFixed(1)} follows / 10K views</span>}</summary>
            <ul className="mt-3 divide-y divide-line">{b.posts.sort((x, y) => (hasOwned ? (y.views || 0) - (x.views || 0) : y.metric - x.metric)).slice(0, 12).map((p) => (
              <li key={p.url} className="flex items-start gap-3 py-2 text-[13px]">
                <span className="num w-14 flex-none text-right font-semibold">{fmtK(hasOwned ? p.views : p.metric)}</span>
                <span className="min-w-0 flex-1"><a href={p.url} target="_blank" rel="noreferrer" className="line-clamp-2 hover:text-accent">"{cleanLine(p.text.split(" \n ")[0] || p.text).slice(0, 140)}"</a><span className="num text-[10.5px] text-muted">{p.src}{p.kind ? ` · ${p.kind}` : ""} · {dShort(p.posted_at)}{p.sponsored ? " · sponsored" : ""}{hasOwned ? ` · ${fmtK(p.follows)} follows · ${fmtK((p.saves || 0) + (p.shares || 0))} saves+shares` : median ? ` · ${(p.metric / median).toFixed(0)}x a typical post` : ""}</span></span>
              </li>))}{b.posts.length > 12 && <li className="num py-2 text-[11px] text-dim">+{b.posts.length - 12} more</li>}</ul>
          </details>
        ))}
      </div>

      <div className="card mt-4 p-5">
        <div className="label mb-2">{hasOwned ? "Views per post over the last prints" : "A typical post, over time"}</div>
        <Spark values={hist.map((x: any) => Number(x.median)).filter(Boolean)} labels={[dShort(hist[0]?.captured_at), dShort(hist.at(-1)?.captured_at)]} format={fmtK} stroke="#6b38c7" />
        <div className="num mt-2 text-[10.5px] text-dim">Each point is the typical post (likes + comments) at that weekly print. Up and to the right means the ordinary post is getting better, not just the best one.</div>
      </div>
      <div className="num mt-3 text-[10.5px] text-dim">Posts are placed in lanes by what was said or written; your manager can move one if it landed wrong. {!hasOwned && "Connect your Instagram from the home page to see views, follows, saves and shares."}</div>
    </div>
  );
}
