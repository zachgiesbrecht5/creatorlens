"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Cand } from "@/components/HoodCards";

// Review the neighbors one at a time: profile, recent reels or videos playing
// inline, and a verdict. Right (or →, or the green button) = matches my
// creator's lane. Left = doesn't. Each verdict teaches the next round.
type Verdict = "like" | "pass";
const fmt = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

function embedFor(m: { url: string; kind: string }) {
  const yt = m.url.match(/[?&]v=([A-Za-z0-9_-]{11})/); if (yt) return { src: `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1`, ratio: "16/9" };
  const ig = m.url.match(/instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/); if (ig) return { src: `https://www.instagram.com/${m.url.includes("/reel/") ? "reel" : "p"}/${ig[1]}/embed/`, ratio: m.url.includes("/reel/") ? "9/16" : "1/1" };
  return null;
}

export function SwipeDeck({ hoodId, candidates, onVerdict, onClose }: { hoodId: string; candidates: Cand[]; onVerdict: (handle: string, v: Verdict) => void; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<Verdict | null>(null);
  const start = useRef<number | null>(null);
  const c = candidates[i];

  const decide = async (v: Verdict) => {
    if (!c || leaving) return;
    setLeaving(v);
    fetch("/api/neighborhood/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hoodId, handle: c.handle, platform: c.platform, verdict: v }) }).catch(() => {});
    onVerdict(c.handle, v);
    setTimeout(() => { setLeaving(null); setDx(0); setI((x) => x + 1); }, 260);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight") decide("like"); if (e.key === "ArrowLeft") decide("pass"); if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  if (!c) return (
    <div className="sw-overlay" onClick={onClose}>
      <div className="sw-done" onClick={(e) => e.stopPropagation()}><div className="text-[18px] font-semibold">That's everyone in this round.</div><div className="mt-1 text-[13px] text-muted">Your likes and passes shape the next three. The printer keeps going if fewer than two matched.</div><button onClick={onClose} className="btn-dark mt-4 !py-1.5 !text-[12px]">back to the cards</button></div>
    </div>
  );
  const media = (c.media || []).slice(0, 3);
  const tilt = leaving === "like" ? 18 : leaving === "pass" ? -18 : dx / 12;
  const x = leaving === "like" ? 900 : leaving === "pass" ? -900 : dx;
  return (
    <div className="sw-overlay">
      <button className="sw-close" onClick={onClose} aria-label="close">✕</button>
      <div className="sw-hint sw-hint-l">← not my creator's lane</div>
      <div className="sw-hint sw-hint-r">matches the lane →</div>
      <div className="sw-card" style={{ transform: `translateX(${x}px) rotate(${tilt}deg)`, transition: leaving ? "transform .26s ease-in" : dx ? "none" : "transform .2s" }}
        onTouchStart={(e) => { start.current = e.touches[0].clientX; }} onTouchMove={(e) => { if (start.current != null) setDx(e.touches[0].clientX - start.current); }} onTouchEnd={() => { if (dx > 90) decide("like"); else if (dx < -90) decide("pass"); else setDx(0); start.current = null; }}>
        <div className="sw-top">
          {c.avatar_url ? <img src={c.avatar_url} alt="" /> : <span className="st-chip-blank" style={{ width: 52, height: 52 }} />}
          <div className="min-w-0"><div className="truncate text-[17px] font-semibold tracking-tight">{c.display_name}</div><div className="num text-[11px] text-muted">@{c.handle} · {fmt(c.followers)} · {c.platform === "youtube" ? "YouTube" : "Instagram"}{c.brands > 0 ? ` · ${c.brands} brands` : ""}</div></div>
          <a href={c.platform === "youtube" ? `https://www.youtube.com/${c.handle.startsWith("UC") ? "channel/" : "@"}${c.handle}` : `https://www.instagram.com/${c.handle}/`} target="_blank" rel="noreferrer" className="num ml-auto text-[10.5px] text-dim hover:text-accent">open profile ↗</a>
        </div>
        <p className="sw-why">{c.reason}</p>
        {media.length > 0 ? (
          <div className={`sw-media ${media.some((m) => m.kind === "reel") ? "sw-media-tall" : ""}`}>
            {media.map((m, k) => { const e = embedFor(m); return e ? <iframe key={k} src={e.src} style={{ aspectRatio: e.ratio }} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading={k === 0 ? "eager" : "lazy"} /> : <a key={k} href={m.url} target="_blank" rel="noreferrer" className="sw-thumb">{m.thumb && <img src={m.thumb} alt="" />}</a>; })}
          </div>
        ) : <div className="sw-media-empty num text-[11px] text-dim">no recent posts available to preview · open profile ↗</div>}
        {c.top?.length > 0 && <div className="num mt-3 truncate text-[11px] text-muted">paid by: {c.top.join(" · ")}</div>}
        <div className="sw-actions">
          <button onClick={() => decide("pass")} className="sw-pass" title="Not a match (←)">✕ not the lane</button>
          <span className="num text-[10.5px] text-dim">{i + 1} of {candidates.length}</span>
          <button onClick={() => decide("like")} className="sw-like" title="Matches (→)">✓ matches my creator</button>
        </div>
      </div>
    </div>
  );
}
