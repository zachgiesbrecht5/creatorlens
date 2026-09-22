"use client";
import { useState } from "react";

type Fb = { id: number; email: string | null; path: string | null; mood: string | null; kind: string; body: string | null; created_at: string };
type Cr = { id: number; scope: string; note: string | null; created_at: string; brand: string; creator: string; by: string };

export function CorrectionsTable({ rows }: { rows: Cr[] }) {
  const [done, setDone] = useState<Record<number, string>>({});
  async function act(id: number, action: "apply" | "dismiss") {
    setDone((d) => ({ ...d, [id]: action === "apply" ? "applied" : "dismissed" }));
    await fetch("/api/corrections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action }) });
  }
  return (
    <table className="tbl">
      <thead><tr><th>Brand</th><th>On</th><th>Flag</th><th>By</th><th></th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-medium">{r.brand}{r.note && <div className="text-[11px] text-muted">{r.note}</div>}</td>
            <td className="text-muted">@{r.creator}</td>
            <td className="num text-[11px]">{r.scope === "brand" ? "never a sponsor" : "not a sponsor here"}</td>
            <td className="text-muted">{r.by}</td>
            <td className="whitespace-nowrap text-right font-mono text-[11px]">
              {done[r.id] ? <span className="text-dim">{done[r.id]}</span> : <><button onClick={() => act(r.id, "apply")} className="text-accent hover:underline">apply</button><button onClick={() => act(r.id, "dismiss")} className="ml-3 text-muted hover:text-fg">dismiss</button></>}
            </td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={5} className="py-6 text-center text-sm text-muted">No open flags.</td></tr>}
      </tbody>
    </table>
  );
}

export function FeedbackList({ rows }: { rows: Fb[] }) {
  const tone: Record<string, string> = { love: "text-ok", ok: "text-muted", stuck: "text-bad" };
  return (
    <div className="divide-y divide-line">
      {rows.map((f) => (
        <div key={f.id} className="py-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-dim">
            {f.kind === "question" && <span className="pill-accent">question</span>}
            {f.mood && <span className={tone[f.mood]}>{f.mood}</span>}
            <span>{f.path}</span><span>{new Date(f.created_at).toLocaleString()}</span>
            {f.email && <a href={`mailto:${f.email}?subject=${encodeURIComponent("Re: your Sponsorprint note")}`} className="text-accent hover:underline">{f.email} ↗</a>}
          </div>
          {f.body && <p className="mt-1 whitespace-pre-wrap">{f.body}</p>}
        </div>
      ))}
      {!rows.length && <p className="py-6 text-center text-sm text-muted">No feedback yet.</p>}
    </div>
  );
}
