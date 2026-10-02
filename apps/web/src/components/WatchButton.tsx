"use client";
import { useState } from "react";

type R = { id: string; name: string };
// Watch a creator, filed under one of your roster creators' lanes (or none).
export function WatchButton({ platform, handle, initial, roster = [], initialFor = null }: { platform: string; handle: string; initial: boolean; roster?: R[]; initialFor?: string | null }) {
  const [on, setOn] = useState(initial);
  const [forId, setForId] = useState<string | null>(initialFor);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send(rosterCreatorId: string | null | undefined, toggleOff = false) {
    setBusy(true); setErr(null); setOpen(false);
    const r = await fetch("/api/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform, handle, ...(toggleOff ? {} : { rosterCreatorId }) }) });
    const j = await r.json(); setBusy(false);
    if (r.status === 402) { window.location.href = "/pricing"; return; }
    if (!r.ok) { setErr(j.error || "failed"); return; }
    setOn(!!j.watching); setForId(j.rosterCreatorId ?? null);
  }
  const label = on ? `watching ✓${forId && roster.find((r) => r.id === forId) ? ` · ${roster.find((r) => r.id === forId)!.name}` : ""}` : "watch ◉";
  return (
    <span className="relative inline-flex items-center gap-2">
      <button onClick={() => (roster.length ? setOpen((o) => !o) : send(null, on))} disabled={busy} className={`hover:text-accent disabled:opacity-50 ${on ? "text-ok" : ""}`} title={on ? "Watching: re-printed weekly, new brands flagged" : "Watch this creator: re-print weekly and flag new brands"}>{label}</button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-line bg-surface p-1 shadow-pop font-sans text-[12.5px]">
          <div className="num px-2 py-1 text-[10px] text-dim">{on ? "file under" : "watch for"}</div>
          {roster.map((r) => <button key={r.id} onClick={() => send(r.id)} className={`block w-full rounded px-2 py-1.5 text-left hover:bg-surface2 ${forId === r.id ? "font-semibold" : ""}`}>{r.name}</button>)}
          <button onClick={() => send(null)} className={`block w-full rounded px-2 py-1.5 text-left hover:bg-surface2 ${on && !forId ? "font-semibold" : ""}`}>general watchlist</button>
          {on && <button onClick={() => send(undefined, true)} className="block w-full rounded px-2 py-1.5 text-left text-bad hover:bg-surface2">stop watching</button>}
        </div>
      )}
      {err && <span className="text-bad">{err}</span>}
    </span>
  );
}
