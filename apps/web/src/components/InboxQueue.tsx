"use client";
import { useState } from "react";
type Item = { id: string; kind: string; roster_creator_id: string | null; creator_guess: string | null; brand: string | null; payload: any; subject: string | null; from_email: string | null; snippet: string | null; gmail_url: string | null; received_at: string | null; status: string };
const KIND: Record<string, string> = { project: "New project", project_update: "Project update", payout: "Payout", event: "Event" };
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
export function InboxQueue({ items: i0, roster, watch: w0, note, gmailConnected }: { items: Item[]; roster: { id: string; name: string }[]; watch: boolean; note: string | null; gmailConnected: boolean }) {
  const [items, setItems] = useState(i0); const [watch, setWatch] = useState(w0); const [busy, setBusy] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, any>>({});
  async function toggle() { setBusy("w"); const r = await fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ watch: !watch }) }); setBusy(null); if (r.ok) setWatch(!watch); }
  async function act(id: string, action: "approve" | "dismiss") {
    setBusy(id); const r = await fetch("/api/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action, edits: edits[id] || {} }) }); const j = await r.json(); setBusy(null);
    if (!r.ok) { alert(j.error || "failed"); return; }
    setItems((l) => l.map((x) => (x.id === id ? { ...x, status: action === "approve" ? "approved" : "dismissed" } : x)));
  }
  const pending = items.filter((i) => i.status === "pending"); const done = items.filter((i) => i.status !== "pending");
  const set = (id: string, k: string, v: any) => setEdits((e) => ({ ...e, [id]: { ...(e[id] || {}), [k]: v } }));
  const Field = ({ it, k, placeholder, type = "text", w = "!w-40" }: { it: Item; k: string; placeholder: string; type?: string; w?: string }) => <input type={type} defaultValue={it.payload?.[k] ?? ""} placeholder={placeholder} className={`input-flat ${w} !py-1 text-[12px] ${type === "date" ? "font-mono text-[11px]" : ""}`} onChange={(e) => set(it.id, k, e.target.value)} />;
  return (
    <div>
      <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
        <div><div className="text-[13.5px] font-medium">Inbox watch is {watch ? "on" : "off"}</div><div className="num text-[11px] text-muted">{!gmailConnected ? "Connect Gmail in Settings first (it needs the read-only inbox permission; reconnect once)." : note || (watch ? "Checks hourly." : "Turn on to start reading your inbox for confirmations.")}</div></div>
        <button onClick={toggle} disabled={busy === "w" || !gmailConnected} className={`!py-1.5 !text-[12px] ${watch ? "btn-ghost" : "btn-dark"} disabled:opacity-50`}>{watch ? "turn off" : "turn on"}</button>
      </div>
      {!pending.length && <div className="card mb-5 p-6 text-[13px] text-muted">Nothing waiting. New confirmations appear here within an hour of landing in your inbox.</div>}
      <div className="space-y-3">
        {pending.map((it) => (
          <div key={it.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><div className="flex items-center gap-2"><span className="pill">{KIND[it.kind] || it.kind}</span><span className="text-[14px] font-semibold tracking-tight">{it.brand || "(brand?)"}</span><span className="num text-[11px] text-muted">{d(it.received_at)}</span></div><div className="mt-1 text-[13px]">{it.payload?.summary}</div><div className="num mt-1 truncate text-[10.5px] text-dim">{it.subject} · {it.from_email}{it.gmail_url ? <> · <a href={it.gmail_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">open in Gmail ↗</a></> : null}</div></div>
              <div className="flex items-center gap-2"><button onClick={() => act(it.id, "dismiss")} disabled={busy === it.id} className="btn-ghost !py-1.5 !text-[12px]">dismiss</button><button onClick={() => act(it.id, "approve")} disabled={busy === it.id} className="btn-dark !py-1.5 !text-[12px]">approve</button></div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select defaultValue={it.roster_creator_id || ""} onChange={(e) => set(it.id, "roster_creator_id", e.target.value)} className="input-flat !w-auto !py-1 font-mono text-[11px]"><option value="">creator…</option>{roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              {it.creator_guess && !it.roster_creator_id && <span className="num text-[10.5px] text-warn">guessed: {it.creator_guess}</span>}
              <input defaultValue={it.brand || ""} placeholder="brand" className="input-flat !w-40 !py-1 text-[12px]" onChange={(e) => set(it.id, "brand", e.target.value)} />
              {it.kind !== "event" && <><Field it={it} k="title" placeholder="campaign" /><Field it={it} k="deliverables" placeholder="deliverables" w="!w-56" /><Field it={it} k="due_at" placeholder="due" type="date" w="!w-36" /><Field it={it} k="go_live_at" placeholder="live" type="date" w="!w-36" /><Field it={it} k={it.kind === "payout" ? "amount" : "fee"} placeholder={it.kind === "payout" ? "amount" : "fee to creator"} type="number" w="!w-28" /></>}
              {it.kind === "payout" && <select defaultValue={it.payload?.status || "invoiced"} onChange={(e) => set(it.id, "status", e.target.value)} className="input-flat !w-auto !py-1 font-mono text-[11px]"><option value="invoiced">invoiced</option><option value="paid">paid</option><option value="scheduled">scheduled</option></select>}
              {it.kind === "project_update" && <select defaultValue={it.payload?.status || ""} onChange={(e) => set(it.id, "status", e.target.value)} className="input-flat !w-auto !py-1 font-mono text-[11px]"><option value="">status unchanged</option><option value="confirmed">confirmed</option><option value="in_production">in production</option><option value="delivered">delivered</option><option value="invoiced">invoiced</option><option value="paid">paid</option><option value="cancelled">cancelled</option></select>}
              {it.kind === "event" && <><Field it={it} k="title" placeholder="event" w="!w-56" /><Field it={it} k="starts_at" placeholder="when" type="datetime-local" w="!w-48" /><Field it={it} k="location" placeholder="where" /><Field it={it} k="rsvp_url" placeholder="RSVP link" /></>}
            </div>
          </div>
        ))}
      </div>
      {done.length > 0 && <div className="card mt-6 divide-y divide-line"><div className="px-4 pt-3 label">Reviewed</div>{done.slice(0, 30).map((it) => <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[12.5px]"><span className="truncate"><span className="pill mr-2">{KIND[it.kind] || it.kind}</span>{it.brand} · {it.payload?.summary}</span><span className={`num text-[10.5px] ${it.status === "approved" ? "text-ok" : "text-dim"}`}>{it.status}</span></div>)}</div>}
    </div>
  );
}
