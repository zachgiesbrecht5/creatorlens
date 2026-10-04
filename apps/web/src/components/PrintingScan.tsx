"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { PrinterMachine } from "@/components/PrinterMachine";
import { startWorkingLoop, playPrint } from "@/lib/print-sound";

// While a scan runs: the printer types out what it's doing and feeds a blank
// print, line by line. Watches the job over Realtime and reloads when done.
export function PrintingScan({ jobId, initialStatus, handle, platform }: { jobId: string; initialStatus: string; handle: string; platform: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [ahead, setAhead] = useState<number | null>(null);
  const [readyAt, setReadyAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const router = useRouter();

  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel(`job-${jobId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "scan_jobs", filter: `id=eq.${jobId}` }, (payload) => {
        const s = (payload.new as any).status as string;
        setStatus(s);
        if (s === "failed") setError((payload.new as any).error);
        if (s === "done") setTimeout(() => router.refresh(), 400);
      }).subscribe();
    const pos = async () => { const { data } = await sb.rpc("queue_position", { p_job: jobId }); if (typeof data === "number") setAhead(data); };
    const ready = async () => { const { data } = await sb.rpc("ig_pool_ready_at"); setReadyAt((data as string | null) || null); };
    pos(); ready();
    const tick = setInterval(() => setNow(Date.now()), 15000);
    const poll = setInterval(async () => {
      const { data } = await sb.from("scan_jobs").select("status,error").eq("id", jobId).single();
      if (data?.status === "done") { clearInterval(poll); router.refresh(); }
      if (data?.status === "failed") { clearInterval(poll); setStatus("failed"); setError(data.error); }
      if (data?.status === "queued") pos(); else setAhead(0);
      if (data?.status === "rate_limited" || data?.status === "queued") ready();
    }, 5000);
    return () => { sb.removeChannel(ch); clearInterval(poll); clearInterval(tick); };
  }, [jobId, router]);

  // printer noise while it works; a proper print-out when it lands
  useEffect(() => {
    if (status === "failed" || status === "done") return;
    const stop = startWorkingLoop();
    return stop;
  }, [status]);
  useEffect(() => { if (status === "done") playPrint(8, 1600); }, [status]);

  const failed = status === "failed";
  const minsLeft = readyAt ? Math.max(1, Math.ceil((new Date(readyAt).getTime() - now) / 60000)) : null;
  const readyClock = readyAt ? new Date(readyAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
  const src = platform === "youtube" ? "videos" : "posts";
  const lines = failed ? [`ERROR: ${String(error || "scan failed").slice(0, 26)}`]
    : status === "queued" ? (ahead && ahead > 0 ? [`IN LINE: ${ahead} AHEAD`, `QUEUED @${handle}`] : [`QUEUED @${handle}`, "WARMING UP…"])
    : status === "rate_limited" ? (minsLeft ? [`PLATFORM LIMIT · ${minsLeft} MIN`, `RESUMES ${readyClock}`] : ["PLATFORM LIMIT. WAITING…", "RETRYING SOON"])
    : status === "done" ? ["DONE ✓ LOADING…"]
    : [`READING ${src}…`, "FINDING SPONSORS…", "CHECKING BRANDS…", "LOOKING UP CONTACTS…", "ALMOST THERE…"];

  return (
    <div className="mx-auto mt-8 max-w-[480px]">
      <PrinterMachine lines={lines} printing={!failed} />
      <div className="rc-feed">
        <div className="rc-paper rc-paper-blank">
          <div className="rc-line rc-head"><span>sponsorprint</span><span>print in progress</span></div>
          <div className="rc-line rc-title"><span className="rc-handle">@{handle}</span><span className="rc-sub">{platform === "youtube" ? "YouTube" : "Instagram"}</span></div>
          <div className="rc-rule" />
          <div className="rc-line rc-cols"><span>brand</span><span>evidence</span><span>last</span><span>deals</span></div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rc-line rc-row rc-ghost" style={{ animationDelay: `${i * 180}ms` }}><span /><span /><span /><span /></div>
          ))}
          <div className="rc-rule" />
          <div className="rc-line rc-foot"><span>{failed ? "print failed" : status === "rate_limited" ? (minsLeft ? `Instagram's hourly limit is used up · prints resume at ${readyClock} (about ${minsLeft} min) · you can leave this page` : "waiting on the platform, you can leave this page") : ahead && ahead > 0 ? `${ahead} print${ahead === 1 ? "" : "s"} ahead of you · about ${Math.ceil(ahead / 4) * 0.5 + 0.5} min` : "usually 10 to 40 seconds"}</span><span>public posts only</span></div>
          <div className="rc-tear" />
        </div>
      </div>
      {failed && <p className="mt-4 text-center text-sm text-bad">{String(error || "The scan failed.")}</p>}
    </div>
  );
}
