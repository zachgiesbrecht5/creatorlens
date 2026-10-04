"use client";
import { useState } from "react";
// Settings: paste the outreach tracker sheet link; the worker reads it hourly.
export function TrackerLink({ initialId, note, connected }: { initialId: string | null; note: string | null; connected: boolean }) {
  const [url, setUrl] = useState(initialId ? `https://docs.google.com/spreadsheets/d/${initialId}` : "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(clear = false) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/tracker", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: clear ? "" : url }) });
    const j = await r.json(); setBusy(false);
    setMsg(r.ok ? (clear ? "Tracker unlinked." : "Linked. First sync within 15 minutes; then hourly.") : j.error || "failed");
    if (clear) setUrl("");
  }
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="input-flat !w-[420px] !py-1.5 font-mono text-[12px]" />
        <button onClick={() => save(false)} disabled={busy || !url} className="btn-dark !py-1.5 !text-[12px] disabled:opacity-50">{initialId ? "update" : "link tracker"}</button>
        {initialId && <button onClick={() => save(true)} disabled={busy} className="btn-ghost !py-1.5 !text-[12px]">unlink</button>}
      </div>
      {!connected && <p className="num mt-1.5 text-[11px] text-warn">Needs Gmail connected with the sheet permission (reconnect Gmail above once; the sheet permission is read-only).</p>}
      {(msg || note) && <p className="num mt-1.5 text-[11px] text-muted">{msg || note}</p>}
    </div>
  );
}
