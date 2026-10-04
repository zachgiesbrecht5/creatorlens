"use client";
import { useState } from "react";
type R = { id: string; text: string; status: string; reply: string | null; created_by: string; created_at: string };
export function Requests({ rows, api, asCreator = false, rosterCreatorId }: { rows: R[]; api: string; asCreator?: boolean; rosterCreatorId?: string }) {
  const [list, setList] = useState(rows); const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  async function post(body: any) { setBusy(true); const r = await fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, rosterCreatorId }) }); const j = await r.json(); setBusy(false); return r.ok ? j : null; }
  async function add() { const j = await post({ text }); if (j) { setList((l) => [j, ...l]); setText(""); } }
  async function update(id: string, patch: any) { const j = await post({ id, ...patch }); if (j) setList((l) => l.map((x) => (x.id === id ? j : x))); }
  return (
    <div>
      {asCreator && <div className="card mb-5 flex gap-2 p-4"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="What do you need?" className="input-flat flex-1 !py-1.5 text-[13px]" onKeyDown={(e) => e.key === "Enter" && text && add()} /><button onClick={add} disabled={busy || !text} className="btn-dark !py-1.5 !text-[12px] disabled:opacity-50">send</button></div>}
      <div className="space-y-2">
        {!list.length && <div className="card p-6 text-[13px] text-muted">No requests yet.</div>}
        {list.map((q) => (
          <div key={q.id} className="card p-4">
            <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="text-[14px]">{q.text}</div><div className="num mt-1 text-[10.5px] text-dim">{new Date(q.created_at).toLocaleDateString()}</div>{q.reply && <div className="mt-2 rounded-lg bg-surface2 px-3 py-2 text-[12.5px]"><span className="num text-[10px] text-muted">reply · </span>{q.reply}</div>}</div>
              {asCreator ? <span className="pill">{q.status.replace("_", " ")}</span> : <select value={q.status} onChange={(e) => update(q.id, { status: e.target.value })} className="input-flat !w-auto !py-1 font-mono text-[11px]"><option value="open">open</option><option value="in_progress">in progress</option><option value="done">done</option></select>}
            </div>
            {!asCreator && <input defaultValue={q.reply || ""} placeholder="reply (the creator sees this)" className="input-flat mt-2 !py-1 text-[12px]" onBlur={(e) => e.target.value !== (q.reply || "") && update(q.id, { reply: e.target.value })} />}
          </div>
        ))}
      </div>
    </div>
  );
}
