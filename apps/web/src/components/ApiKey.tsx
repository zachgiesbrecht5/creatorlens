"use client";
import { useState } from "react";
export function ApiKey({ has }: { has: boolean }) {
  const [key, setKey] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [exists, setExists] = useState(has);
  async function make() { setBusy(true); const r = await fetch("/api/key", { method: "POST" }); const j = await r.json(); setBusy(false); if (j.key) { setKey(j.key); setExists(true); } }
  async function revoke() { if (!confirm("Revoke the key? Anything using it stops working.")) return; setBusy(true); await fetch("/api/key", { method: "DELETE" }); setBusy(false); setKey(null); setExists(false); }
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2"><button onClick={make} disabled={busy} className="btn-dark !py-1.5 !text-[12px]">{exists ? "rotate key" : "create key"}</button>{exists && <button onClick={revoke} disabled={busy} className="btn-ghost !py-1.5 !text-[12px]">revoke</button>}</div>
      {key && <div className="w-[420px] rounded-lg border border-line bg-surface2 p-2"><div className="num mb-1 text-[10px] text-muted">shown once; copy it now</div><code className="block select-all break-all font-mono text-[11.5px]">{key}</code></div>}
    </div>
  );
}
