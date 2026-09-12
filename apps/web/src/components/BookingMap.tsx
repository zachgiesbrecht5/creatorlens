"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

// Who this brand books, over time. One dot per deal: x = when the post went up,
// y = the creator's audience (log scale), colour = platform, ring = repeat
// partner. Hover a dot for the creator; click to open their print.
export type Deal = {
  published_at: string; platform: "youtube" | "instagram" | "tiktok"; confidence_label: string;
  creator: { id: string; handle: string; display_name: string | null; followers: number | null; category: string | null; avatar_url: string | null };
  repeat: boolean; content_url: string | null;
};

const W = 920, H = 340, PAD = { l: 56, r: 20, t: 20, b: 40 };
const COLOR: Record<string, string> = { youtube: "#c4302b", instagram: "#b13589", tiktok: "#0b0d12" };

export function BookingMap({ deals }: { deals: Deal[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = useMemo(() => deals.filter((d) => d.published_at && d.creator.followers).map((d) => ({ ...d, t: new Date(d.published_at).getTime(), f: Math.max(1000, d.creator.followers!) })), [deals]);
  if (pts.length < 2) return null;

  const tMin = Math.min(...pts.map((p) => p.t)), tMax = Math.max(...pts.map((p) => p.t));
  const span = Math.max(tMax - tMin, 1000 * 60 * 60 * 24 * 60);
  const fMin = Math.min(...pts.map((p) => p.f)), fMax = Math.max(...pts.map((p) => p.f));
  const lMin = Math.log10(fMin) - 0.25, lMax = Math.log10(fMax) + 0.45;
  const x = (t: number) => PAD.l + ((t - tMin) / span) * (W - PAD.l - PAD.r);
  const y = (f: number) => H - PAD.b - ((Math.log10(f) - lMin) / (lMax - lMin)) * (H - PAD.t - PAD.b);

  // y ticks at powers of ten inside range
  const yTicks: number[] = [];
  for (let e = Math.floor(lMin); e <= Math.ceil(lMax); e++) { if (e >= Math.floor(lMin) && Math.pow(10, e) >= fMin / 3 && Math.pow(10, e) <= fMax * 3) yTicks.push(Math.pow(10, e)); }
  // x ticks: quarter starts
  const xTicks: Date[] = [];
  const d0 = new Date(tMin); d0.setDate(1); d0.setMonth(Math.floor(d0.getMonth() / 3) * 3);
  for (let d = new Date(d0); d.getTime() <= tMax; d.setMonth(d.getMonth() + 3)) xTicks.push(new Date(d));

  const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
  const median = [...pts].sort((a, b) => a.f - b.f)[Math.floor(pts.length / 2)].f;
  const byCat = new Map<string, number>();
  for (const p of pts) { const c = p.creator.category || "Other"; byCat.set(c, (byCat.get(c) || 0) + 1); }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const perQuarter = pts.length / Math.max(1, xTicks.length);
  const h = hover !== null ? pts[hover] : null;

  return (
    <div className="card mt-6 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-3">
        <div className="text-sm font-medium">Who they book, over time</div>
        <div className="num flex flex-wrap gap-4 text-[11px] text-muted">
          <span>median audience <span className="text-fg">{short(median)}</span></span>
          <span>about <span className="text-fg">{perQuarter.toFixed(1)}</span> deals a quarter</span>
          <span>{cats.map(([c, n]) => `${c} ${Math.round((n / pts.length) * 100)}%`).join(" · ")}</span>
          <span className="flex gap-3"><span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLOR.youtube }} />YouTube</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLOR.instagram }} />Instagram</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full border-2 border-fg" />repeat</span></span>
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" onMouseLeave={() => setHover(null)}>
          {yTicks.map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(f)} y2={y(f)} stroke="#e4e6ea" strokeDasharray="2 4" />
              <text x={PAD.l - 8} y={y(f) + 4} textAnchor="end" fontFamily="var(--font-mono), monospace" fontSize="10" fill="#8b93a1">{short(f)}</text>
            </g>
          ))}
          {xTicks.map((d) => (
            <g key={d.getTime()}>
              <line x1={x(d.getTime())} x2={x(d.getTime())} y1={PAD.t} y2={H - PAD.b} stroke="#eef0f3" />
              <text x={x(d.getTime()) + 4} y={H - PAD.b + 16} fontFamily="var(--font-mono), monospace" fontSize="10" fill="#8b93a1">{`Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`}</text>
            </g>
          ))}
          <text x={PAD.l - 8} y={PAD.t - 6} textAnchor="end" fontFamily="var(--font-mono), monospace" fontSize="10" fill="#8b93a1">audience</text>
          {pts.map((p, i) => {
            const on = hover === i;
            return (
              <Link key={i} href={`/c/${p.platform}/${p.creator.handle}`}>
                <circle cx={x(p.t)} cy={y(p.f)} r={on ? 9 : 6.5} fill={COLOR[p.platform] || "#0b0d12"} fillOpacity={p.confidence_label === "High" ? 0.85 : 0.45}
                  stroke={p.repeat ? "#0b0d12" : "#fff"} strokeWidth={p.repeat ? 2 : 1.5} style={{ cursor: "pointer", transition: "r .12s" }}
                  onMouseEnter={() => setHover(i)} />
              </Link>
            );
          })}
        </svg>
        {h && (
          <div className="pointer-events-none absolute left-0 top-0 m-3 flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 shadow-pop">
            {h.creator.avatar_url ? <img src={h.creator.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-surface2" />}
            <div>
              <div className="text-[13px] font-medium">{h.creator.display_name || h.creator.handle} <span className="num text-[10px] text-dim">@{h.creator.handle}</span></div>
              <div className="num text-[10.5px] text-muted">{short(h.f)} · {h.creator.category || "Other"} · {new Date(h.t).toLocaleDateString(undefined, { month: "short", year: "numeric" })}{h.repeat ? " · repeat partner" : ""} · {h.confidence_label}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
