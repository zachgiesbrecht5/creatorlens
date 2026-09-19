"use client";
import { useState } from "react";
const STAGES = ["pitched", "replied", "negotiating", "closed", "dead"] as const;
export function StageControl({ id, stage, value }: { id: string; stage: string; value: number | null }) {
  const [s, setS] = useState(stage);
  const [v, setV] = useState(value == null ? "" : String(value));
  const save = async (patch: any) => { await fetch("/api/outreach", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...patch }) }); };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex rounded-md bg-surface2 p-0.5 font-mono text-[10.5px]">
        {STAGES.map((x) => <button key={x} onClick={() => { setS(x); save({ stage: x }); }} className={`rounded px-2 py-0.5 ${s === x ? (x === "closed" ? "bg-ok text-white" : x === "dead" ? "bg-line2 text-fg" : "bg-fg text-white") : "text-muted hover:text-fg"}`}>{x}</button>)}
      </span>
      {(s === "negotiating" || s === "closed") && <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => save({ deal_value: v })} placeholder="$" className="input-flat !w-20 !py-0.5 num text-[11px]" />}
    </span>
  );
}
