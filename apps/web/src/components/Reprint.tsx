"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { unlockAudio, playChunk } from "@/lib/print-sound";

// Force a fresh print of this creator (skips the 14-day cache). Costs a print
// credit on the free plan, free on paid plans and for the house.
export function Reprint({ platform, handle }: { platform: string; handle: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  async function go() {
    unlockAudio(); playChunk();
    setBusy(true); setErr(null);
    const r = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform, handle, force: true }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 402) { window.location.href = "/pricing"; return; }
    if (!r.ok) { setErr(j.error || "Couldn't re-print"); return; }
    router.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={go} disabled={busy} className="hover:text-accent disabled:opacity-50" title="Pull a fresh print now (reads the latest posts again)">{busy ? "queuing…" : "re-print ↻"}</button>
      {err && <span className="text-bad">{err}</span>}
    </span>
  );
}
