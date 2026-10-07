"use client";
import { useState } from "react";
type Row = { platform: string; handle: string; added_by: string; name: string; avatar: string | null; followers: number | null; category: string | null; top: { hook: string; metric: number; url: string }[] };
const fmtK = (n: number | null) => (!n ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
export function MyWatch({ rows, platform: defaultPlatform, children }: { rows: Row[]; platform: string; children?: React.ReactNode }) {
  const [list, setList] = useState(rows);
  const [handle, setHandle] = useState(""); const [platform, setPlatform] = useState(defaultPlatform); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  async function add() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/me/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform, handle }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.error || "failed"); return; }
    setList((l) => [{ platform, handle: j.handle, added_by: "creator", name: j.name || j.handle, avatar: j.avatar || null, followers: j.followers || null, category: null, top: [] }, ...l]); setHandle(""); setMsg("Added. Their print runs now; hooks show within a day.");
  }
  async function remove(h: string, p: string) { await fetch("/api/me/watch", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform: p, handle: h }) }); setList((l) => l.filter((x) => !(x.handle === h && x.platform === p))); }
  return (
    <div>
      <div className="card mb-6 p-5" style={{ borderTop: "3px solid #2f5bff" }}>
        <div className="label mb-1">Follow a creator</div>
        <p className="mb-3 text-[13px] text-muted">Paste a handle. Sponsorprint prints their last 250 posts and their best openings start showing up below within a day.</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg"><button className={platform === "instagram" ? "on" : ""} onClick={() => setPlatform("instagram")}>Instagram</button><button className={platform === "youtube" ? "on" : ""} onClick={() => setPlatform("youtube")}>YouTube</button></div>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle or profile link" className="input-flat !w-72 !py-2 font-mono text-[13px]" onKeyDown={(e) => e.key === "Enter" && handle && add()} autoFocus />
          <button onClick={add} disabled={busy || !handle} className="btn-dark !py-2 !text-[12.5px] disabled:opacity-50">{busy ? "adding…" : "follow"}</button>
          {msg && <span className="num text-[11px] text-muted">{msg}</span>}
        </div>
        <div className="num mt-2 text-[10.5px] text-dim">{list.length} in your lane{list.filter((c) => c.added_by !== "creator").length ? ` · ${list.filter((c) => c.added_by !== "creator").length} picked by your manager` : ""} · up to 25 of your own</div>
      </div>
      {children}
      <div className="mb-3 mt-8"><div className="label mb-1">Who's in your lane</div><p className="text-[13px] text-muted">Unfollow your own picks any time; your manager's are marked.</p></div>
      {!list.length && <div className="card p-6 text-[13px] text-muted">No one yet. Add a creator you rate and their best hooks start showing up on your home page.</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((c) => (
          <div key={c.platform + c.handle} className="card p-4">
            <div className="flex items-center gap-3">
              {c.avatar ? <img src={c.avatar} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="inline-block h-11 w-11 rounded-full bg-surface2" />}
              <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-semibold tracking-tight">{c.name}</div><div className="num text-[10.5px] text-muted">@{c.handle} · {fmtK(c.followers)}{c.category ? ` · ${c.category}` : ""} · {c.added_by === "creator" ? "you follow" : "manager's pick"}</div></div>
              {c.added_by === "creator" && <button onClick={() => remove(c.handle, c.platform)} className="num text-[11px] text-dim hover:text-bad">unfollow</button>}
            </div>
            {c.top.length > 0 && <ul className="mt-3 space-y-1">{c.top.map((t) => <li key={t.url} className="flex items-start gap-2 text-[12.5px]"><span className="num w-12 flex-none text-right font-semibold">{fmtK(t.metric)}</span><a href={t.url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:text-accent">"{t.hook}"</a></li>)}</ul>}
          </div>
        ))}
      </div>
    </div>
  );
}
