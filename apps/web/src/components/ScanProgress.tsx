"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

// Watches one scan_jobs row over Supabase Realtime and reloads when it lands.
export function ScanProgress({ jobId, initialStatus, compact }: { jobId: string; initialStatus: string; compact?: boolean }) {
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
  const title = status === "queued" ? "Queued" : status === "running" ? "Scanning" : status === "rate_limited" ? "Waiting on platform limit" : failed ? "Scan failed" : "Done";
  const msg = status === "queued" ? "Reading their content through the official API."
    : status === "running" ? "Usually 10 to 40 seconds."
    : status === "rate_limited" ? "Retrying automatically in a few minutes. You can leave this page."
    : failed ? String(error || "") : "Refreshing…";

  return (
    <div className={`card ${compact ? "mt-6 p-4" : "mt-8 p-6"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {!failed && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />}
          <span className={failed ? "text-bad" : ""}>{title}</span>
        </div>
        <span className="num text-[10px] uppercase tracking-wider text-dim">{status.replace("_", " ")}</span>
      </div>
      {!failed && <div className="scanbar mt-3"><span /></div>}
      <p className={`mt-2 text-sm ${failed ? "text-bad" : "text-muted"}`}>{msg}</p>
    </div>
  );
}
