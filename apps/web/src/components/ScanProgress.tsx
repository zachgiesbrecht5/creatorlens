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

  const msg = status === "queued" ? "Queued. Reading their content through the official API…"
    : status === "running" ? "Scanning. Usually 10 to 40 seconds."
    : status === "rate_limited" ? "Platform rate limit hit. Retrying automatically in a few minutes, you can leave this page."
    : status === "failed" ? `Scan failed: ${error}` : "Done. Refreshing…";

  return (
    <div className={`card ${compact ? "mt-4 p-3 text-sm" : "mt-6 p-6"} flex items-center gap-3`}>
      {status !== "failed" && <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-brand" />}
      <span className={status === "failed" ? "text-red-700" : "text-slate-700"}>{msg}</span>
    </div>
  );
}
