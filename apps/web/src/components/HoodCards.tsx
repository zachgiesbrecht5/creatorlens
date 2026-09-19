"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { playPrint } from "@/lib/print-sound";

// The three-card neighborhood reveal, usable from Start or from any print.
export type Cand = { platform: string; handle: string; display_name: string; avatar_url: string | null; followers: number | null; reason: string; print_status: string; brands: number; top: string[] };
export type Hood = { id: string; status: string; error?: string | null; candidates: Cand[] };
const fmt = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

const MIN_GOOD = 2;      // neighbors with at least one brand before we stop
const MAX_ROUNDS = 3;

/**
 * Polls a neighborhood. When a round finishes with fewer than MIN_GOOD neighbors
 * that actually have brands, it asks for another round (fresh faces) and keeps
 * the good ones from earlier rounds on screen, up to MAX_ROUNDS.
 * `seed` is what to send when asking again: { rosterCreatorId } or { creatorId }.
 */
export function useHood(initialId: string | null, seed?: { rosterCreatorId?: string; creatorId?: string }) {
  const [hoodId, setHoodId] = useState(initialId);
  const [hood, setHood] = useState<Hood | null>(null);
  const [kept, setKept] = useState<Cand[]>([]);
  const [rounds, setRounds] = useState(1);
  const [searching, setSearching] = useState(false);
  const timer = useRef<any>();
  useEffect(() => { setHoodId(initialId); setHood(null); setKept([]); setRounds(1); }, [initialId]);
  useEffect(() => {
    if (!hoodId) return;
    const tick = async () => {
      const r = await fetch(`/api/neighborhood?id=${hoodId}`); if (!r.ok) return;
      const j: Hood = await r.json();
      setHood((prev) => { const was = prev?.candidates.filter((c) => c.print_status === "done").length || 0; const now = j.candidates.filter((c) => c.print_status === "done").length; if (now > was) playPrint(8, 1400); return j; });
      const settled = j.status === "failed" || (j.status === "done" && j.candidates.every((c) => c.print_status === "done" || c.print_status === "failed"));
      if (!settled) return;
      clearInterval(timer.current);
      const good = j.candidates.filter((c) => c.print_status === "done" && c.brands > 0);
      const goodTotal = kept.length + good.length;
      if (goodTotal < MIN_GOOD && rounds < MAX_ROUNDS && seed) {
        // keep what worked, go find more
        setKept((k) => [...k, ...good.filter((g) => !k.some((x) => x.handle === g.handle))]);
        setSearching(true);
        const rr = await fetch("/api/neighborhood?again=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(seed) });
        const jj = await rr.json(); setSearching(false);
        if (rr.ok && jj.id && jj.id !== hoodId) { setRounds((n) => n + 1); setHood(null); setHoodId(jj.id); }
      }
    };
    tick(); timer.current = setInterval(tick, 3500);
    return () => clearInterval(timer.current);
  }, [hoodId]);
  // merged view: kept good ones first, then the current round
  const merged: Hood | null = hood ? { ...hood, candidates: [...kept, ...hood.candidates.filter((c) => !kept.some((k) => k.handle === c.handle))] } : kept.length ? { id: hoodId || "", status: "running", candidates: kept } : null;
  return { hood: merged, rounds, searching, hoodId };
}

export function HoodCards({ hood, from }: { hood: Hood | null; from?: string }) {
  const q = from ? `?from=${encodeURIComponent(from)}` : "";
  return (
    <div className="st-cards">
      {([...(hood?.candidates || []), ...Array(Math.max(0, 3 - (hood?.candidates.length || 0))).fill(null)] as (Cand | null)[]).map((c, i) => (
        <div key={c ? c.handle : `blank-${i}`} className={`st-card ${c ? "st-card-in" : ""} ${c?.print_status === "done" ? "st-card-done" : ""}`} style={{ animationDelay: `${i * 220}ms` }}>
          {!c ? (
            <div className="st-card-wait"><span className="st-dots"><i /><i /><i /></span>{hood?.status === "failed" ? "nothing close enough" : "searching the lane"}</div>
          ) : (
            <>
              <div className="st-card-top">
                {c.avatar_url ? <img src={c.avatar_url} alt="" /> : <span className="st-chip-blank" style={{ width: 56, height: 56 }} />}
                <div className="min-w-0"><div className="truncate text-[15px] font-semibold tracking-tight">{c.display_name}</div><div className="num truncate text-[11px] text-muted">@{c.handle} · {fmt(c.followers)}</div></div>
              </div>
              <p className="st-why">{c.reason}</p>
              <div className="st-card-print">
                {c.print_status === "done" ? (
                  <>
                    <div className="st-brands"><b className="st-count">{c.brands}</b> brands</div>
                    {c.top.length > 0 && <div className="num truncate text-[11px] text-muted">{c.top.join(" · ")}</div>}
                    <Link href={`/c/${c.platform}/${c.handle}${q}`} className="st-open">open the print →</Link>
                  </>
                ) : c.print_status === "failed" ? (
                  <div className="num text-[11px] text-dim">print failed</div>
                ) : (
                  <div className="st-printing"><span className="st-dots"><i /><i /><i /></span>{c.print_status === "rate_limited" ? "waiting on the platform" : "printing"}</div>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
