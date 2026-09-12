"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

// The market at a glance. Every brand is a logo bubble: left→right is how
// recently they booked, up is the audience size they typically book (log),
// bubble size is deal count, ring colour is the platform they spend on.
// Hover for the signals: verticals booked, platform split, repeat rate, cadence.
export type MapBrand = {
  id: string; name: string; domain: string | null; category: string | null;
  deals: number; creators: number; last_seen: string | null; first_seen: string | null;
  median_followers: number | null; repeat_creators: number; yt: number; ig: number;
  verticals: Record<string, number> | null; is_mass: boolean; is_affiliate: boolean;
};

const W = 1100, H = 560, PAD = { l: 64, r: 30, t: 30, b: 44 };

export function BrandMap({ brands }: { brands: MapBrand[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const pts = useMemo(() => brands.filter((b) => b.last_seen && b.median_followers && b.deals > 0 && !b.is_affiliate), [brands]);
  if (pts.length < 3) return null;

  const t = (d: string) => new Date(d).getTime();
  const tMin = Math.min(...pts.map((p) => t(p.last_seen!))), tMax = Math.max(...pts.map((p) => t(p.last_seen!)));
  const span = Math.max(tMax - tMin, 1000 * 60 * 60 * 24 * 90);
  const fMin = Math.min(...pts.map((p) => p.median_followers!)), fMax = Math.max(...pts.map((p) => p.median_followers!));
  const lMin = Math.log10(fMin) - 0.3, lMax = Math.log10(fMax) + 0.5;
  const x = (d: string) => PAD.l + ((t(d) - tMin) / span) * (W - PAD.l - PAD.r);
  const y = (f: number) => H - PAD.b - ((Math.log10(f) - lMin) / (lMax - lMin)) * (H - PAD.t - PAD.b);
  const dMax = Math.max(...pts.map((p) => p.deals));
  const r = (deals: number) => 12 + Math.sqrt(deals / dMax) * 22;
  const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
  const ring = (b: MapBrand) => (b.yt && b.ig ? "url(#mixRing)" : b.ig ? "#b13589" : "#c4302b");

  const yTicks: number[] = [];
  for (let e = Math.floor(lMin); e <= Math.ceil(lMax); e++) { const v = Math.pow(10, e); if (v >= fMin / 3 && v <= fMax * 3) yTicks.push(v); }
  const xTicks: Date[] = [];
  const d0 = new Date(tMin); d0.setDate(1); d0.setMonth(Math.floor(d0.getMonth() / 3) * 3);
  for (let d = new Date(d0); d.getTime() <= tMax; d.setMonth(d.getMonth() + 3)) xTicks.push(new Date(d));

  const cats = [...new Set(pts.map((p) => p.category).filter(Boolean))] as string[];
  const h = hover ? pts.find((p) => p.id === hover) : null;
  const logo = (b: MapBrand) => (b.domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(b.domain)}&sz=64` : null);

  return (
    <div className="card mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <div className="text-sm font-medium">The map</div>
          <div className="num text-[11px] text-muted">right = booked recently · up = books bigger creators · size = deals · ring: <span style={{ color: "#c4302b" }}>YouTube</span> / <span style={{ color: "#b13589" }}>Instagram</span> / both</div>
        </div>
        <div className="flex flex-wrap gap-1 font-mono text-[11px]">
          <button onClick={() => setCat(null)} className={`rounded px-2 py-0.5 ${!cat ? "bg-fg text-white" : "text-muted hover:text-fg"}`}>all</button>
          {cats.slice(0, 12).map((c) => <button key={c} onClick={() => setCat(cat === c ? null : c)} className={`rounded px-2 py-0.5 ${cat === c ? "bg-fg text-white" : "text-muted hover:text-fg"}`}>{c}</button>)}
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="mixRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c4302b" /><stop offset="1" stopColor="#b13589" /></linearGradient>
            <clipPath id="logoClip"><circle r="1" /></clipPath>
          </defs>
          {yTicks.map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(f)} y2={y(f)} stroke="#e4e6ea" strokeDasharray="2 4" />
              <text x={PAD.l - 10} y={y(f) + 4} textAnchor="end" fontFamily="var(--font-mono), monospace" fontSize="10" fill="#8b93a1">{short(f)}</text>
            </g>
          ))}
          {xTicks.map((d) => (
            <g key={d.getTime()}>
              <line x1={x(d.toISOString())} x2={x(d.toISOString())} y1={PAD.t} y2={H - PAD.b} stroke="#eef0f3" />
              <text x={x(d.toISOString()) + 4} y={H - PAD.b + 18} fontFamily="var(--font-mono), monospace" fontSize="10" fill="#8b93a1">{`Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`}</text>
            </g>
          ))}
          <text x={PAD.l - 10} y={PAD.t - 8} textAnchor="end" fontFamily="var(--font-mono), monospace" fontSize="10" fill="#8b93a1">audience they book</text>
          <text x={W - PAD.r} y={H - PAD.b + 34} textAnchor="end" fontFamily="var(--font-mono), monospace" fontSize="10" fill="#8b93a1">last booked →</text>
          {pts.map((b) => {
            const dim = cat && b.category !== cat;
            const cx = x(b.last_seen!), cy = y(b.median_followers!), rr = r(b.deals);
            const on = hover === b.id;
            const src = logo(b);
            return (
              <Link key={b.id} href={`/brands/${b.id}`}>
                <g opacity={dim ? 0.12 : 1} style={{ cursor: "pointer", transition: "opacity .15s" }} onMouseEnter={() => setHover(b.id)}>
                  <circle cx={cx} cy={cy} r={rr + (on ? 3 : 0)} fill="#fff" stroke={ring(b)} strokeWidth={b.repeat_creators > 0 ? 3 : 1.5} />
                  {src ? (
                    <image href={src} x={cx - rr * 0.62} y={cy - rr * 0.62} width={rr * 1.24} height={rr * 1.24} preserveAspectRatio="xMidYMid meet" style={{ borderRadius: "50%" }} />
                  ) : (
                    <text x={cx} y={cy + 4} textAnchor="middle" fontFamily="var(--font-sans), Inter, sans-serif" fontSize={rr * 0.8} fontWeight="600" fill="#0b0d12">{b.name.slice(0, 1)}</text>
                  )}
                  {rr >= 22 && <text x={cx} y={cy + rr + 12} textAnchor="middle" fontFamily="var(--font-sans), Inter, sans-serif" fontSize="10" fill="#5b6472">{b.name}</text>}
                </g>
              </Link>
            );
          })}
        </svg>
        {h && (
          <div className="pointer-events-none absolute left-0 top-0 m-3 w-72 rounded-md border border-line bg-surface p-3 shadow-pop">
            <div className="flex items-center gap-2">
              {logo(h) && <img src={logo(h)!} alt="" className="h-6 w-6 rounded" />}
              <div className="text-[13px] font-medium">{h.name}</div>
              {h.category && <span className="pill ml-auto">{h.category}</span>}
            </div>
            <div className="num mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted">
              <span>deals <b className="text-fg">{h.deals}</b></span>
              <span>creators <b className="text-fg">{h.creators}</b></span>
              <span>median audience <b className="text-fg">{short(h.median_followers!)}</b></span>
              <span>repeat <b className={h.repeat_creators ? "text-ok" : "text-fg"}>{h.repeat_creators}</b></span>
              <span>platform <b className="text-fg">{[h.yt ? `YT ${h.yt}` : null, h.ig ? `IG ${h.ig}` : null].filter(Boolean).join(" · ")}</b></span>
              <span>last <b className="text-fg">{new Date(h.last_seen!).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</b></span>
            </div>
            {h.verticals && Object.keys(h.verticals).length > 0 && (
              <div className="mt-2 text-[11px] text-muted">books: {Object.entries(h.verticals).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(" · ")}</div>
            )}
            {h.is_mass && <div className="mt-1 num text-[10px] text-dim">mass sponsor · low signal</div>}
          </div>
        )}
      </div>
    </div>
  );
}
