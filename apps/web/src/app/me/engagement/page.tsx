import Link from "next/link";
import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { Spark } from "@/components/Spark";
import { cleanLine } from "@/lib/clean-text";
import { myCreator, history, fmtK, dShort } from "@/lib/me-stats";

// Median engagement tile -> page. What a normal post does, what the best ones did, and what the best
// ones had in common (format, how they opened). All from the creator's own print.
export default async function MyEngagement() {
  const { roster: r, preview } = await requireCreator();
  const platform = r.platform === "youtube" ? "youtube" : "instagram";
  const me = await myCreator(platform, r.handle || "");
  const perf: any = me?.performance || null;
  const rows = me ? await history(me.id, 180) : [];
  const median = Number(perf?.median || 0);
  const top: any[] = (perf?.top || []).map((t: any) => ({ ...t, mult: median ? +(Number(t.metric) / median).toFixed(1) : null }));
  const topAvg = top.length ? Math.round(top.reduce((s, t) => s + Number(t.metric || 0), 0) / top.length) : 0;
  const said = top.filter((t) => t.audio === "voice" && t.spoken).length;
  const formats: any[] = [...(perf?.formats || [])].sort((a, b) => b.avg - a.avg);
  const openers: any[] = (perf?.openers || []).slice(0, 6);
  // owned insights when this account sits in the manager's portfolio: shares and saves are what reach is made of
  const { data: owned } = me ? await supabaseAdmin().from("owned_post_insights").select("permalink,posted_at,likes,comments,saves,shares,reach").eq("creator_id", me.id).order("posted_at", { ascending: false }).limit(60) : { data: [] as any[] };
  const med = (a: number[]) => { const s = a.filter((n) => n != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const label = perf?.metric_label || "engagement";
  return (
    <div className="mx-auto max-w-5xl">
      {preview && <div className="mb-4 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-[12.5px]"><span>Previewing as <b>{r.name}</b>.</span><a href="/api/portal/preview?clear=1" className="num text-[11px] text-accent hover:underline">end preview</a></div>}
      <div className="mb-5"><div className="label mb-1"><Link href="/me" className="hover:text-accent">Home</Link> · engagement</div><h1 className="h1">A normal post: {fmtK(median)} {label}</h1><p className="mt-1 text-[14px] text-muted">The median of your last {perf?.items || 0} posts, which is what a brand should expect, not the average that one viral reel drags upward. Everything below is measured against it.</p></div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Median post</div><div className="mt-1 text-[22px] font-bold">{fmtK(median)}</div><div className="num text-[10.5px] text-dim">{label} · {perf?.items || 0} posts</div></div>
        <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Top 10 average</div><div className="mt-1 text-[22px] font-bold">{fmtK(topAvg)}</div><div className="num text-[10.5px] text-dim">{median ? `${(topAvg / median).toFixed(0)}x a normal post` : ""}</div></div>
        <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Top 10 that open talking</div><div className="mt-1 text-[22px] font-bold">{said}<span className="text-[13px] font-normal text-muted"> / {top.length}</span></div><div className="num text-[10.5px] text-dim">spoken first line, not a sound</div></div>
        {owned?.length ? <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Median shares · saves</div><div className="mt-1 text-[22px] font-bold">{fmtK(med(owned.map((o) => o.shares)))}<span className="text-[13px] font-normal text-muted"> · {fmtK(med(owned.map((o) => o.saves)))}</span></div><div className="num text-[10.5px] text-dim">from your own account, last {owned.length} posts</div></div>
          : <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Best format</div><div className="mt-1 text-[22px] font-bold capitalize">{formats[0]?.kind || "—"}</div><div className="num text-[10.5px] text-dim">{formats[0] ? `avg ${fmtK(formats[0].avg)} over ${formats[0].count}` : ""}</div></div>}
      </div>

      <div className="card mt-4 p-5">
        <div className="label mb-2">Your median over time</div>
        <Spark values={rows.map((x) => Number(x.median)).filter(Boolean)} labels={[dShort(rows[0]?.captured_at), dShort(rows.at(-1)?.captured_at)]} format={fmtK} stroke="#6b38c7" />
        <div className="num mt-2 text-[10.5px] text-dim">Each point is the median of the posts in the window at that print. Up and to the right means the typical post is getting better, not just the best one.</div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-5">
          <div className="label mb-1">The posts that beat your median most</div>
          <p className="mb-3 text-[13px] text-muted">What a viewer heard or saw first, and how far each one went past a normal post.</p>
          <ol className="divide-y divide-line">{top.sort((a, b) => (b.mult ?? 0) - (a.mult ?? 0)).map((t, i) => (
            <li key={t.url} className="flex items-start gap-3 py-2 text-[13px]">
              <span className="num w-5 flex-none text-right text-muted">{i + 1}</span>
              <span className="num w-14 flex-none text-right font-semibold">{fmtK(Number(t.metric))}</span>
              <span className="min-w-0 flex-1"><a href={t.url} target="_blank" rel="noreferrer" className="line-clamp-2 hover:text-accent">"{cleanLine(t.spoken || t.on_video || t.on_screen || t.hook || t.title)}"</a><span className="num text-[10.5px] text-muted">{t.audio === "voice" && t.spoken ? "said" : t.on_video ? "on video" : t.on_screen ? "on cover" : "caption"} · {t.kind || ""} · {dShort(t.published_at)}{t.sponsored ? " · sponsored" : ""}</span></span>
              <span className="num flex-none text-ok">{t.mult ? `${t.mult}x` : ""}</span>
            </li>))}</ol>
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <div className="label mb-2">By format</div>
            <table className="tbl"><thead><tr><th>Format</th><th className="text-right">Posts</th><th className="text-right">Avg</th><th className="text-right">vs median</th></tr></thead>
              <tbody>{formats.map((f) => <tr key={f.kind}><td className="capitalize">{f.kind}</td><td className="num text-right">{f.count}</td><td className="num text-right">{fmtK(f.avg)}</td><td className={`num text-right ${median && f.avg >= median ? "text-ok" : "text-muted"}`}>{median ? `${(f.avg / median).toFixed(1)}x` : ""}</td></tr>)}{!formats.length && <tr><td colSpan={4} className="py-4 text-center text-muted">No format split yet.</td></tr>}</tbody></table>
          </div>
          {openers.length > 0 && (
            <div className="card p-5">
              <div className="label mb-1">How you open, and what each opening does</div>
              <p className="mb-2 text-[12px] text-muted">Openings you've used more than once, in your own words.</p>
              <ul className="space-y-1.5">{openers.map((o: any) => <li key={o.key} className="flex items-baseline justify-between gap-2 text-[12.5px]"><span className="min-w-0 truncate" title={cleanLine(o.label)}>"{cleanLine(o.label)}"</span><span className="num flex-none text-[11px] text-muted">{o.count}x · {o.mult != null ? <span className={o.mult >= 1 ? "text-ok" : "text-bad"}>{o.mult}x median</span> : fmtK(o.avg)}</span></li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
