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
    const printing = !!scan && (scan.found || []).some((f: any) => f.print_status !== "done" && f.print_status !== "failed");
    if (!scan || (scan.status !== "queued" && scan.status !== "running" && !printing)) return;
    timer.current = setInterval(async () => { const r = await fetch(`/api/brandscan?id=${scan.id}`); if (r.ok) { const j = await r.json(); setScan(j); const printing = (j.found || []).some((f: any) => f.print_status !== "done" && f.print_status !== "failed"); if ((j.status === "done" && !printing) || j.status === "failed") clearInterval(timer.current); } }, 4000);
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
      {scan?.status === "done" && scan.found.length > 0 && (
        <div className="bs-list">
          <div className="bs-head"><span>channel</span><span>the video that matched</span><span>size</span><span>print</span></div>
          {[...scan.found].sort((a: any, b: any) => Number(b.new_to_index) - Number(a.new_to_index)).map((f: any) => (
            <div key={f.external_id} className="bs-row">
              <span className="flex min-w-0 items-center gap-2">{f.avatar_url ? <img src={f.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="inline-block h-7 w-7 rounded-full bg-surface2" />}<span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold tracking-tight">{f.display_name}</span><span className="num block truncate text-[10px] text-muted">{f.new_to_index ? <em className="not-italic text-ok">new to the index</em> : "already printed"}{f.category ? ` · ${f.category}` : ""}</span></span></span>
              <a href={`https://www.youtube.com/watch?v=${f.video_id}`} target="_blank" rel="noreferrer" className="num truncate text-[11px] text-muted hover:text-accent" title={f.video_title}>{f.video_title} ↗</a>
              <span className="num text-[11px]">{f.followers ? (f.followers >= 1e6 ? `${(f.followers / 1e6).toFixed(1)}M` : f.followers >= 1e3 ? `${Math.round(f.followers / 1e3)}K` : f.followers) : ""}</span>
              <span className="num text-[11px]">{f.print_status === "done" ? <Link href={`/c/youtube/${f.handle}`} className="text-accent hover:underline">{f.confirmed_deals > 0 ? `${f.confirmed_deals} deal${f.confirmed_deals === 1 ? "" : "s"} confirmed →` : "open print →"}</Link> : f.print_status === "failed" ? <span className="text-dim">failed</span> : <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />printing</span>}</span>
            </div>
          ))}
        </div>
      )}
      {scan?.status === "done" && (
        <div className="num mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted">
          <span><b className="text-fg">{scan.found.length}</b> YouTube channels found · <b className="text-fg">{scan.found.filter((f: any) => f.new_to_index).length}</b> new to the index</span>
          {scan.ig_pulse && <span>Instagram <b className="text-fg">#{scan.ig_pulse.tag}</b>: <b className="text-fg">{scan.ig_pulse.posts}</b> posts in 30 days {scan.ig_pulse.posts >= 10 ? "· active program" : scan.ig_pulse.posts > 0 ? "· quiet" : "· no hashtag activity"}</span>}
          
        </div>
      )}
    </div>
  );
}
