"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// "Who runs this?" research for one brand: queues the research agent (parent company, agency of record,
// who to email), then refreshes the page when it lands. One job per brand; the result is shared house-wide.
export function BrandResearch({ brandId, done, summary }: { brandId: string; done: boolean; summary: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "working") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/contacts/${brandId}`).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => null) : null;
      const st = j?.research?.status;
      if (st === "done") { clearInterval(t); setState("idle"); router.refresh(); }
      if (st === "failed") { clearInterval(t); setState("error"); setMsg("Research couldn't verify anyone this time."); }
    }, 5000);
    return () => clearInterval(t);
  }, [state, brandId, router]);

  if (done) return summary ? <p className="text-[13px] leading-relaxed text-fg"><span className="label mr-1.5 !text-[10px]">Research</span>{summary}</p> : null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn-ghost" disabled={state === "working"} onClick={async () => {
        setState("working"); setMsg(null);
        const r = await fetch(`/api/contacts/${brandId}/research`, { method: "POST" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setState("error"); setMsg(j.error || "Research is unavailable right now."); }
      }}>{state === "working" ? "Researching… about a minute" : "Research who runs their creator work"}</button>
      <span className="text-[12px] text-dim">{msg || "Finds the parent company, agency of record and the person to email."}</span>
    </div>
  );
}
