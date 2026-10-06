"use client";
import { useEffect, useRef, useState } from "react";
import { ScanList } from "./ScanList";

type Scan = { id: string; status: string; found: any[]; ig_pulse: { tag: string; posts: number | null; brand_handle?: string | null; notes?: string[]; verified?: number } | null; error?: string | null };

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
          <div className="text-[12.5px] text-muted">YouTube disclosures ({`#${brandName.replace(/[^A-Za-z0-9]/g, "")}Partner`}, "sponsored by {brandName}") plus Instagram: creators {brandName} tags, their #partner hashtag, and creators' linked accounts. Every one gets printed; disclosed deals only.</div>
        </div>
        <button onClick={go} disabled={busy || !!running} className="btn-dark !py-1.5 !text-[12px]">{running ? "searching…" : scan?.status === "done" ? "run again" : "find their creators"}</button>
      </div>
      {err && <p className="mt-2 text-[12px] text-bad">{err}</p>}
      {scan?.status === "done" && scan.found.length > 0 && <ScanList found={scan.found} />}
      {scan?.status === "done" && (
        <div className="num mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted">
          <span><b className="text-fg">{scan.found.filter((f: any) => f.platform !== "instagram").length}</b> YouTube · <b className="text-fg">{scan.found.filter((f: any) => f.platform === "instagram").length}</b> Instagram · <b className="text-fg">{scan.found.filter((f: any) => f.new_to_index).length}</b> new to the index</span>
          {scan.ig_pulse?.brand_handle && <span>read <b className="text-fg">@{scan.ig_pulse.brand_handle}</b>'s posts for creators they tag</span>}
          {scan.ig_pulse && scan.ig_pulse.posts != null && <span>Instagram <b className="text-fg">#{scan.ig_pulse.tag}</b>: <b className="text-fg">{scan.ig_pulse.posts}</b> recent posts {scan.ig_pulse.posts >= 10 ? "· active program" : scan.ig_pulse.posts > 0 ? "· quiet" : "· no hashtag activity"}</span>}
          {scan.ig_pulse && scan.found.length > 0 && !scan.found.some((f: any) => f.platform === "instagram") && !("verified" in scan.ig_pulse) && <span className="text-warn">this scan ran before Instagram creators were added · run again</span>}
          {(scan.ig_pulse?.notes || []).map((n: string) => <span key={n} className="text-dim">{n}</span>)}
          
        </div>
      )}
    </div>
  );
}
