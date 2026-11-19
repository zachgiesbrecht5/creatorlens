"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type ScoutCandidate = {
  id: string; channel_id: string; handle: string; title: string; subs: number; thumbnail: string | null; lane: string | null; query: string | null;
  breakout_video_id: string | null; breakout_title: string | null; breakout_views: number | null; breakout_published_at: string | null;
  median_views: number | null; mult: number | null; views_per_sub: number | null; uploads_60d: number | null;
  sponsors: number | null; sponsor_names: string[] | null; printed_at: string | null; status: string; found_at: string;
};
export type ScoutQuery = { id: string; query: string; lane: string | null; active: boolean; last_run_at: string | null; runs: number; found: number };

const n = (v: number | null | undefined) => (v == null ? "" : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(v));
const ago = (iso: string | null) => { if (!iso) return "never"; const h = (Date.now() - new Date(iso).getTime()) / 3600e3; return h < 1 ? "just now" : h < 24 ? `${Math.floor(h)}h ago` : `${Math.floor(h / 24)}d ago`; };

async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/scout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  return { ok: !!r?.ok, error: (j as any).error as string | undefined };
}

export function ScoutBoard({ candidates, tab }: { candidates: ScoutCandidate[]; tab: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  async function move(id: string, status: string) {
    setBusy(id);
    const r = await post({ action: "status", id, status });
    setBusy(null);
    if (r.ok) { setGone((g) => new Set(g).add(id)); router.refresh(); }
  }
  const rows = candidates.filter((c) => !gone.has(c.id));
  if (!rows.length) return <div className="card p-8 text-center text-[13px] text-muted">{tab === "new" ? "Nothing new yet. The scout runs one search about every 20 minutes, so check back in a bit." : "Nothing here yet."}</div>;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((c) => (
        <div key={c.id} className="card flex flex-col gap-3 p-4 sm:flex-row">
          {c.breakout_video_id && (
            <a href={`https://www.youtube.com/watch?v=${c.breakout_video_id}`} target="_blank" rel="noopener noreferrer" className="block shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://i.ytimg.com/vi/${c.breakout_video_id}/mqdefault.jpg`} alt="" width={224} height={126} className="h-[126px] w-[224px] rounded-md border border-line object-cover" loading="lazy" />
            </a>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <a href={`https://www.youtube.com/channel/${c.channel_id}`} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold tracking-tight hover:text-accent">{c.title}</a>
              <span className="font-mono text-[11px] text-muted">{n(c.subs)} subs</span>
              {c.lane && <span className="pill">{c.lane}</span>}
              {c.sponsors == null ? <span className="pill">print pending</span> : c.sponsors === 0 ? <span className="pill pill-ok">no sponsors yet</span> : <span className="pill pill-warn">{c.sponsors} sponsor{c.sponsors === 1 ? "" : "s"}</span>}
            </div>
            <div className="truncate text-[13px]">{c.breakout_title}</div>
            <div className="text-[12px] text-muted">
              {n(c.breakout_views)} views{c.mult ? <> · <b className="text-fg">{c.mult}x</b> their usual {n(c.median_views)}</> : null}{c.views_per_sub ? <> · {c.views_per_sub}x their subscriber count</> : null}{c.uploads_60d ? <> · {c.uploads_60d} uploads in 60 days</> : null}
            </div>
            {!!c.sponsor_names?.length && <div className="truncate text-[12px] text-muted">Paid or gifted by: {c.sponsor_names.join(", ")}</div>}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {tab !== "shortlisted" && <button disabled={busy === c.id} onClick={() => move(c.id, "shortlisted")} className="btn-dark !py-1.5 !text-[12px]">Shortlist</button>}
              {tab === "shortlisted" && <button disabled={busy === c.id} onClick={() => move(c.id, "contacted")} className="btn-dark !py-1.5 !text-[12px]">Mark contacted</button>}
              {tab !== "dismissed" && <button disabled={busy === c.id} onClick={() => move(c.id, "dismissed")} className="btn-ghost !py-1.5 !text-[12px]">Dismiss</button>}
              {tab !== "new" && <button disabled={busy === c.id} onClick={() => move(c.id, "new")} className="btn-ghost !py-1.5 !text-[12px]">Back to new</button>}
              {c.printed_at && <a href={`/c/youtube/${encodeURIComponent(c.handle)}`} className="text-[12px] text-accent hover:underline">Open print</a>}
              <span className="ml-auto font-mono text-[11px] text-muted">found {ago(c.found_at)} · "{c.query}"</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScoutQueries({ queries }: { queries: ScoutQuery[] }) {
  const router = useRouter();
  const [query, setQuery] = useState(""); const [lane, setLane] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const r = await post({ action: "add_query", query, lane });
    if (!r.ok) { setMsg(r.error || "Could not add that."); return; }
    setQuery(""); setLane(""); router.refresh();
  }
  async function act(body: Record<string, unknown>) { await post(body); router.refresh(); }
  return (
    <div className="card flex flex-col gap-3 p-4 text-[13px]">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-medium">What the scout searches for</span>
        <span className="text-muted">Each phrase is searched about once a day. Write them the way creators title videos, not the way you'd describe a niche.</span>
      </div>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search phrase, e.g. POV driving tips" className="min-w-[220px] flex-1 rounded-md border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent" />
        <input value={lane} onChange={(e) => setLane(e.target.value)} placeholder="Lane, e.g. Cars" className="w-[150px] rounded-md border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent" />
        <button className="btn-dark">Add search</button>
      </form>
      {msg && <span className="text-[12px] text-warn">{msg}</span>}
      <div className="flex flex-col divide-y divide-line">
        {queries.map((q) => (
          <div key={q.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className={q.active ? "font-medium" : "text-muted line-through"}>{q.query}</span>
            {q.lane && <span className="pill">{q.lane}</span>}
            <span className="font-mono text-[11px] text-muted">ran {ago(q.last_run_at)} · {q.found} found</span>
            <span className="ml-auto flex gap-2">
              <button onClick={() => act({ action: "toggle_query", id: q.id, active: !q.active })} className="text-[12px] text-accent hover:underline">{q.active ? "Pause" : "Resume"}</button>
              <button onClick={() => act({ action: "delete_query", id: q.id })} className="text-[12px] text-muted hover:text-fg hover:underline">Remove</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
