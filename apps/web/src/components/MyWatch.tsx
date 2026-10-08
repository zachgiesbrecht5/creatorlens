"use client";
import { useState } from "react";
import { LaneSearch } from "@/components/LaneSearch";
type Row = { platform: string; handle: string; added_by: string; muted?: boolean; name: string; avatar: string | null; followers: number | null; category: string | null; top: { hook: string; metric: number; url: string }[] };
const fmtK = (n: number | null) => (!n ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/** The follow box, then whatever the page passes as children (the brief and the cards), then the list.
 *  Creators can take anyone out: their own follows are removed, the manager's picks are hidden for them only. */
export function MyWatch({ rows, platform: defaultPlatform, children }: { rows: Row[]; platform: string; children?: React.ReactNode }) {
  const [list, setList] = useState(rows);
  const platform = defaultPlatform;
  const [showHidden, setShowHidden] = useState(false);
  const active = list.filter((c) => !c.muted), hidden = list.filter((c) => c.muted);
  async function remove(c: Row) {
    const r = await fetch("/api/me/watch", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform: c.platform, handle: c.handle }) });
    const j = await r.json().catch(() => ({}));
    if (j.removed === "muted") setList((l) => l.map((x) => (x.handle === c.handle && x.platform === c.platform ? { ...x, muted: true } : x)));
    else setList((l) => l.filter((x) => !(x.handle === c.handle && x.platform === c.platform)));
  }
  async function restore(c: Row) {
    await fetch("/api/me/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform: c.platform, handle: c.handle }) });
    setList((l) => l.map((x) => (x.handle === c.handle && x.platform === c.platform ? { ...x, muted: false } : x)));
  }
  const Card = ({ c }: { c: Row }) => (
    <div className={`card p-4 ${c.muted ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3">
        {c.avatar ? <img src={c.avatar} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="inline-block h-11 w-11 rounded-full bg-surface2" />}
        <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-semibold tracking-tight">{c.name}</div><div className="num text-[10.5px] text-muted">@{c.handle} · {fmtK(c.followers)}{c.category ? ` · ${c.category}` : ""} · {c.added_by === "creator" ? "you follow" : "manager's pick"}{c.muted ? " · hidden from your lane" : ""}</div></div>
        {c.muted ? <button onClick={() => restore(c)} className="num text-[11px] text-accent hover:underline">put back</button> : <button onClick={() => remove(c)} className="num text-[11px] text-dim hover:text-bad">{c.added_by === "creator" ? "unfollow" : "remove from my lane"}</button>}
      </div>
      {!c.muted && c.top.length > 0 && <ul className="mt-3 space-y-1">{c.top.map((t) => <li key={t.url} className="flex items-start gap-2 text-[12.5px]"><span className="num w-12 flex-none text-right font-semibold">{fmtK(t.metric)}</span><a href={t.url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:text-accent">"{t.hook}"</a></li>)}</ul>}
    </div>
  );
  return (
    <div>
      <div className="card mb-6 p-5" style={{ borderTop: "3px solid #2f5bff" }}>
        <div className="label mb-1">Scan any creator</div>
        <p className="mb-3 text-[13px] text-muted">Type a handle, pick the account, and you get their print: top posts, what was said first, which brands paid them. It joins your lane at the same time. Anyone you don't rate, remove; your lane is yours.</p>
        <LaneSearch platform={platform} autoFocus onFollowed={(f) => setList((l) => l.some((x) => x.platform === f.platform && x.handle === f.handle) ? l.map((x) => (x.platform === f.platform && x.handle === f.handle ? { ...x, muted: false } : x)) : [{ platform: f.platform, handle: f.handle, added_by: "creator", name: f.name || f.handle, avatar: f.avatar, followers: f.followers, category: null, top: [] }, ...l])} />
        <div className="num mt-2 text-[10.5px] text-dim">{active.length} in your lane · {active.filter((c) => c.added_by === "creator").length} you follow · {active.filter((c) => c.added_by !== "creator").length} picked by your manager{hidden.length ? ` · ${hidden.length} hidden` : ""} · up to 25 of your own</div>
      </div>
      {children}
      <div className="mb-3 mt-8 flex items-end justify-between gap-3"><div><div className="label mb-1">Who's in your lane</div><p className="text-[13px] text-muted">Remove anyone. Your manager keeps their list; what you remove just stops showing up for you.</p></div>{hidden.length > 0 && <button onClick={() => setShowHidden((v) => !v)} className="num text-[11px] text-muted hover:text-accent">{showHidden ? "hide" : "show"} {hidden.length} hidden</button>}</div>
      {!active.length && <div className="card p-6 text-[13px] text-muted">No one yet. Add a creator you rate and their best hooks start showing up on your home page.</div>}
      <div className="grid gap-3 md:grid-cols-2">{active.map((c) => <Card key={c.platform + c.handle} c={c} />)}</div>
      {showHidden && hidden.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">{hidden.map((c) => <Card key={c.platform + c.handle} c={c} />)}</div>}
    </div>
  );
}
