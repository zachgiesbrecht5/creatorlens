"use client";
import { useState } from "react";
import { HoodCards, useHood } from "@/components/HoodCards";
import { PrinterMachine } from "@/components/PrinterMachine";

export function HoodView({ hoodId: initial, seed }: { hoodId: string; seed: { name: string; handle: string; platform: string; followers: number | null; avatar_url: string | null; href: string; creatorId: string | null } | null }) {
  const [startId, setStartId] = useState(initial);
  const { hood, rounds, searching, hoodId } = useHood(startId, seed?.creatorId ? { creatorId: seed.creatorId } : undefined);
  const printing = !!hood && (hood.status !== "done" || hood.candidates.some((c) => c.print_status !== "done" && c.print_status !== "failed"));
  const lcd = searching ? `ROUND ${rounds + 1}: LOOKING FURTHER…` : !hood ? "SCANNING THE LANE…" : hood.status === "failed" ? "NO NEIGHBORS FOUND" : hood.status !== "done" ? "SCANNING THE LANE…" : printing ? `PRINTING ${hood.candidates.filter((c) => c.print_status === "done").length + 1}/${hood.candidates.length}` : `${hood.candidates.filter((c) => c.brands > 0).length} WITH DEALS ✓`;
  const fmt = (n: number | null) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
  async function again() {
    if (!seed?.creatorId) return;
    const r = await fetch("/api/neighborhood?again=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creatorId: seed.creatorId }) });
    const j = await r.json().catch(() => ({})); if (r.ok) setStartId(j.id); else if (r.status === 402) window.location.href = "/pricing?need=neighborhoods";
  }
  return (
    <div>
      <div className="st-hero">
        <div>
          <div className="label mb-2">Neighborhood</div>
          <h1 className="h1">{seed?.name || "This creator"}'s lane</h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">Three creators next to {seed?.name || "them"}, printed and ready. Open any print, then walk to its neighbors, and so on.</p>
          {seed && <div className="mt-5 flex items-center gap-3">{seed.avatar_url ? <img src={seed.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-fg" /> : <div className="h-12 w-12 rounded-full bg-surface2" />}<div><div className="text-[15px] font-semibold">{seed.name}</div><div className="num text-[11px] text-muted">@{seed.handle} · {fmt(seed.followers)} · {seed.platform === "youtube" ? "YouTube" : "Instagram"}</div></div></div>}
        </div>
        <div className="st-machine"><PrinterMachine lcd={lcd} printing={printing} /></div>
      </div>
      <section className="st-hood">
        <div className="st-hood-head"><div className="text-[17px] font-semibold tracking-tight">Neighbors</div>{hood?.status === "done" && seed?.creatorId && <button onClick={again} className="btn-ghost !py-1.5 !text-[12px]">find three more ↻</button>}</div>
        <HoodCards hood={hood} from={`/n/${hoodId}`} />
        {rounds > 1 && <div className="num mt-3 text-[11px] text-dim">round {rounds}: the first picks had no disclosed deals, so the printer kept looking and kept the ones that did.</div>}
      </section>
    </div>
  );
}
