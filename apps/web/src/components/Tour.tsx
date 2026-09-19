"use client";
import { useEffect, useState } from "react";

// Lightweight guided tour: a few pop-ups anchored to elements marked with
// data-tour="key". Shown once per page per browser (localStorage), with Skip.
// Each page passes its own steps; anything whose anchor isn't on screen is skipped.
export type TourStep = { key: string; title: string; body: string };

export function Tour({ id, steps }: { id: string; steps: TourStep[] }) {
  const [i, setI] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; below: boolean } | null>(null);
  const storeKey = `sp_tour_${id}`;

  useEffect(() => {
    try { if (localStorage.getItem(storeKey)) return; } catch { return; }
    const t = setTimeout(() => setI(0), 900);
    return () => clearTimeout(t);
  }, [storeKey]);

  const present = steps.filter((s) => typeof document !== "undefined" && document.querySelector(`[data-tour="${s.key}"]`));
  const step = i >= 0 ? present[i] : null;

  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.key}"]`) as HTMLElement | null;
    if (!el) { setI((x) => x + 1); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const place = () => { const r = el.getBoundingClientRect(); const below = r.bottom + 180 < window.innerHeight; setPos({ top: (below ? r.bottom + 10 : r.top - 10) + window.scrollY, left: Math.max(12, Math.min(r.left + window.scrollX, window.innerWidth - 340)), width: r.width, below }); };
    const t = setTimeout(place, 350); window.addEventListener("resize", place);
    el.classList.add("tour-glow");
    return () => { clearTimeout(t); window.removeEventListener("resize", place); el.classList.remove("tour-glow"); };
  }, [step?.key]);

  const finish = () => { try { localStorage.setItem(storeKey, "1"); } catch {} setI(-1); setPos(null); };
  if (!step || !pos) return null;
  const last = i >= present.length - 1;
  return (
    <div className="tour-pop" style={{ top: pos.top, left: pos.left, transform: pos.below ? "none" : "translateY(-100%)" }} role="dialog">
      <div className="tour-title">{step.title}</div>
      <div className="tour-body">{step.body}</div>
      <div className="tour-actions">
        <span className="num text-[10px] text-dim">{i + 1} of {present.length}</span>
        <span className="flex gap-2"><button onClick={finish} className="tour-skip">skip</button><button onClick={() => (last ? finish() : setI(i + 1))} className="tour-next">{last ? "got it" : "next"}</button></span>
      </div>
    </div>
  );
}
