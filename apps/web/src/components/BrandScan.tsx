"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Scan = { id: string; status: string; found: any[]; ig_pulse: { tag: string; posts: number } | null; error?: string | null };

export function BrandScan({ brandId, brandName, last }: { brandId: string; brandName: string; last: Scan | null }) {
  const [scan, setScan] = useState<Scan | null>(last);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<any>();
  async function go() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/brandscan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId }) });
    const j = await r.json(); setBusy(false);
    if (r.status === 402) { window.location.href = "/pricing"; return; }
    if (!r.ok) { setErr(j.error || "failed"); return; }
    setScan({ id: j.id, status: j.status, found: scan?.found || [], ig_pulse: scan?.ig_pulse || null });
  }
  useEffect(() => {
    if (!scan || (scan.status !== "queued" && scan.status !== "running")) return;
    timer.current = setInterval(async () => { const r = await fetch(`/api/brandscan?id=${scan.id}`); if (r.ok) { const j = await r.json(); setScan(j); if (j.status === "done" || j.status === "failed") { clearInterval(timer.current); window.location.reload(); } } }, 4000);
    return () => clearInterval(timer.current);
  }, [scan?.id, scan?.status]);
  const running = scan && (scan.status === "queued" || scan.status === "running");
  return (
    <div className="card mb-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label mb-0.5">Who else do they book?</div>
          <div className="text-[12.5px] text-muted">Searches the disclosures ({`#${brandName.replace(/[^A-Za-z0-9]/g, "")}Partner`}, "sponsored by {brandName}") and prints the creators behind them. Disclosed deals only.</div>
        </div>
        <button onClick={go} disabled={busy || !!running} className="btn-dark !py-1.5 !text-[12px]">{running ? "searching…" : scan?.status === "done" ? "run again" : "find their creators"}</button>
      </div>
      {err && <p className="mt-2 text-[12px] text-bad">{err}</p>}
      {scan?.status === "done" && (
        <div className="num mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted">
          <span><b className="text-fg">{scan.found.length}</b> YouTube channels found · <b className="text-fg">{scan.found.filter((f) => f.queued === true).length}</b> prints queued</span>
          {scan.ig_pulse && <span>Instagram <b className="text-fg">#{scan.ig_pulse.tag}</b>: <b className="text-fg">{scan.ig_pulse.posts}</b> posts in 30 days {scan.ig_pulse.posts >= 10 ? "· active program" : scan.ig_pulse.posts > 0 ? "· quiet" : "· no hashtag activity"}</span>}
          {scan.found.length > 0 && <span className="text-dim">new prints appear in the creators list below as they finish</span>}
        </div>
      )}
    </div>
  );
}
