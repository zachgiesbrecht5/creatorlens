"use client";
import { useState } from "react";
export function LocationField({ id, initial }: { id: string; initial: string | null }) {
  const [v, setV] = useState(initial || "");
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1.5">
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={async () => { const r = await fetch("/api/signals", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rosterCreatorId: id, location: v }) }); const j = await r.json(); setSaved(j.region ? `matched to ${j.region}` : v ? "no region found" : null); }} placeholder="city, state (e.g. Denver, CO)" className="input-flat !w-52 !py-1 text-[12px]" />
      {saved && <span className="num text-[10px] text-dim">{saved}</span>}
    </span>
  );
}
