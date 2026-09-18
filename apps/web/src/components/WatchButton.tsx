"use client";
import { useState } from "react";

export function WatchButton({ platform, handle, initial }: { platform: string; handle: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function toggle() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform, handle }) });
    const j = await r.json();
    setBusy(false);
    if (r.status === 402) { window.location.href = "/pricing"; return; }
    if (!r.ok) { setErr(j.error || "failed"); return; }
    setOn(!!j.watching);
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={toggle} disabled={busy} className={`hover:text-accent disabled:opacity-50 ${on ? "text-ok" : ""}`} title={on ? "Watching: re-printed weekly, new brands flagged" : "Watch this creator: re-print weekly and flag new brands"}>{on ? "watching ✓" : "watch ◉"}</button>
      {err && <span className="text-bad">{err}</span>}
    </span>
  );
}
