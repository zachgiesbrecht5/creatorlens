"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { PrinterMachine } from "@/components/PrinterMachine";
import { unlockAudio, playChunk } from "@/lib/print-sound";

type Row = { platform: string; handle: string; status: string; jobId?: string; brands?: number };

export function BatchRunner() {
  const [text, setText] = useState("");
  const [platform, setPlatform] = useState<"youtube" | "instagram">("youtube");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<any>();

  async function run() {
    unlockAudio(); playChunk();
    setBusy(true); setErr(null);
    const r = await fetch("/api/scan/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines: text, platform }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "Batch failed"); return; }
    setRows(j.results.map((x: Row) => ({ ...x, status: x.status === "cached" ? "done" : x.status })));
  }

  // poll the jobs until they're all done or failed
  useEffect(() => {
    const pending = rows.filter((r) => r.jobId && (r.status === "queued" || r.status === "running" || r.status === "rate_limited"));
    if (!pending.length) return;
    timer.current = setInterval(async () => {
      const sb = supabaseBrowser();
      const { data } = await sb.from("scan_jobs").select("id,status,rows_found").in("id", pending.map((p) => p.jobId!));
      if (!data) return;
      setRows((rs) => rs.map((r) => { const d = data.find((x) => x.id === r.jobId); return d ? { ...r, status: d.status, brands: d.rows_found ?? r.brands } : r; }));
    }, 4000);
    return () => clearInterval(timer.current);
  }, [rows.map((r) => r.status).join(",")]);

  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "failed" || r.status === "error" || r.status === "no_credits").length;
  const running = rows.length - done - failed;
  const lcd = !rows.length ? "READY" : running > 0 ? `PRINTING ${done + 1}/${rows.length}` : `${done} PRINTS ✓ TEAR`;

  return (
    <div>
      <div className="card p-5">
        <div className="mb-3 flex gap-1 rounded-md bg-surface2 p-0.5 font-mono text-[12px] w-max">
          {(["youtube", "instagram"] as const).map((p) => <button key={p} onClick={() => setPlatform(p)} className={`rounded px-3 py-1 ${platform === p ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}>{p === "youtube" ? "YouTube" : "Instagram"}</button>)}
          <span className="self-center px-2 text-[11px] text-dim">default for bare handles · links and yt:/ig: prefixes override</span>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="input-flat font-mono text-[13px]" placeholder={"@mkbhd\nhttps://www.youtube.com/@mrbeast\nig:gymshark\ninstagram.com/nike"} />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={run} disabled={busy || !text.trim()} className="btn-dark">{busy ? "Queuing…" : "Pull the prints"}</button>
          <span className="num text-[11px] text-dim">{text.split(/[\n,]+/).filter((l) => l.trim()).length} lines</span>
          {err && <span className="text-[12px] text-bad">{err}</span>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-8">
          <div className="pw-machine"><PrinterMachine lcd={lcd} printing={running > 0} /></div>
          <div className="pw">
            <div className="pw-top"><div className="pw-id"><div><div className="rc-head">batch · {rows.length} creators</div><div className="pw-name">{done} printed{failed ? ` · ${failed} failed` : ""}{running ? ` · ${running} in the queue` : ""}</div></div></div></div>
            {rows.map((r) => (
              <div key={r.platform + r.handle} className="pw-row" style={{ cursor: "default", opacity: 1, animation: "none" }}>
                <div className="pw-line" style={{ gridTemplateColumns: "minmax(180px,1.4fr) 1fr 120px 90px" }}>
                  <div className="min-w-0"><span className="font-sans text-[15px] font-semibold tracking-tight">@{r.handle}</span><div className="num text-[10.5px] text-dim">{r.platform === "youtube" ? "YouTube" : "Instagram"}</div></div>
                  <div className="num text-[12px] text-muted">{r.status === "done" ? (r.brands != null ? `${r.brands} deals found` : "printed") : r.status === "no_credits" ? "out of prints" : r.status === "failed" ? "failed" : r.status === "rate_limited" ? "waiting on platform" : r.status === "running" ? "printing…" : "queued"}</div>
                  <div className="num text-[12px]">{r.status === "done" ? <Link href={`/c/${r.platform}/${r.handle}`} className="text-accent hover:underline">open print →</Link> : r.status === "no_credits" ? <Link href="/pricing" className="text-accent hover:underline">upgrade</Link> : <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}</div>
                  <div />
                </div>
              </div>
            ))}
            <div className="pw-foot"><span>{done} of {rows.length} printed</span><span><Link href="/brands?scope=mine" className="hover:text-accent">see every brand across your prints →</Link></span></div>
            <div className="rc-tear" />
          </div>
        </div>
      )}
    </div>
  );
}
