"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { PrinterMachine } from "@/components/PrinterMachine";

// While a scan runs: the printer types out what it's doing and feeds a blank
// print, line by line. Watches the job over Realtime and reloads when done.
export function PrintingScan({ jobId, initialStatus, handle, platform }: { jobId: string; initialStatus: string; handle: string; platform: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
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
    const poll = setInterval(async () => {
      const { data } = await sb.from("scan_jobs").select("status,error").eq("id", jobId).single();
      if (data?.status === "done") { clearInterval(poll); router.refresh(); }
      if (data?.status === "failed") { clearInterval(poll); setStatus("failed"); setError(data.error); }
    }, 5000);
    return () => { sb.removeChannel(ch); clearInterval(poll); };
  }, [jobId, router]);

  const failed = status === "failed";
  const src = platform === "youtube" ? "videos" : "posts";
  const lines = failed ? [`ERROR: ${String(error || "scan failed").slice(0, 26)}`]
    : status === "queued" ? [`QUEUED @${handle}`, "WARMING UP…"]
    : status === "rate_limited" ? ["PLATFORM LIMIT. WAITING…", "RETRYING SOON"]
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
          <div className="rc-line rc-foot"><span>{failed ? "print failed" : status === "rate_limited" ? "waiting on the platform, you can leave this page" : "usually 10 to 40 seconds"}</span><span>public posts only</span></div>
          <div className="rc-tear" />
        </div>
      </div>
      {failed && <p className="mt-4 text-center text-sm text-bad">{String(error || "The scan failed.")}</p>}
    </div>
  );
}
