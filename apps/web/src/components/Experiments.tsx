"use client";
import { useState } from "react";
type Exp = { id: string; idea: string; why: string | null; hook: string | null; status: string; result: string | null; post_url: string | null; metric: number | null; suggested_by: string; created_at: string };
const S = ["idea", "testing", "done", "dropped"];
export function Experiments({ rows, api, rosterCreatorId }: { rows: Exp[]; api: string; rosterCreatorId?: string }) {
  const [list, setList] = useState(rows);
  const [idea, setIdea] = useState(""); const [hook, setHook] = useState(""); const [why, setWhy] = useState(""); const [busy, setBusy] = useState(false);
  async function post(body: any) { setBusy(true); const r = await fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, rosterCreatorId }) }); const j = await r.json(); setBusy(false); return r.ok ? j : null; }
  async function add() { const j = await post({ idea, hook, why }); if (j) { setList((l) => [j, ...l]); setIdea(""); setHook(""); setWhy(""); } }
  async function update(id: string, patch: any) { const j = await post({ id, ...patch }); if (j) setList((l) => l.map((x) => (x.id === id ? j : x))); }
  return (
    <div>
      <div className="card mb-5 p-4">
        <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_1fr_auto]">
          <input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="the idea (one line)" className="input-flat !py-1.5 text-[13px]" />
          <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="hook to try" className="input-flat !py-1.5 text-[13px]" />
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="why (what the data says)" className="input-flat !py-1.5 text-[13px]" />
          <button onClick={add} disabled={busy || !idea} className="btn-dark !py-1.5 !text-[12px] disabled:opacity-50">add</button>
        </div>
      </div>
      <div className="space-y-2">
        {!list.length && <div className="card p-6 text-[13px] text-muted">No experiments yet.</div>}
        {list.map((e) => (
          <div key={e.id} className="card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><div className="text-[14px] font-medium">{e.idea}</div>{e.hook && <div className="text-[12.5px]">hook: "{e.hook}"</div>}{e.why && <div className="text-[12px] text-muted">{e.why}</div>}<div className="num mt-1 text-[10.5px] text-dim">{e.suggested_by === "creator" ? "your idea" : "manager's idea"} · {new Date(e.created_at).toLocaleDateString()}</div></div>
              <select value={e.status} onChange={(ev) => update(e.id, { status: ev.target.value })} className="input-flat !w-auto !py-1 font-mono text-[11px]">{S.map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            {(e.status === "testing" || e.status === "done") && (
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <input defaultValue={e.post_url || ""} placeholder="link to the post" className="input-flat !py-1 font-mono text-[11px]" onBlur={(ev) => ev.target.value !== (e.post_url || "") && update(e.id, { post_url: ev.target.value })} />
                <input defaultValue={e.result || ""} placeholder="what happened (shares, saves, follows)" className="input-flat !py-1 text-[12px]" onBlur={(ev) => ev.target.value !== (e.result || "") && update(e.id, { result: ev.target.value })} />
                <input defaultValue={e.metric ?? ""} placeholder="views" type="number" className="input-flat !w-28 !py-1 font-mono text-[11px]" onBlur={(ev) => Number(ev.target.value) !== Number(e.metric || 0) && update(e.id, { metric: Number(ev.target.value) || null })} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
