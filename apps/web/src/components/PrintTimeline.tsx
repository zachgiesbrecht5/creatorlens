"use client";
import { useMemo, useState } from "react";

// The map on the print: two years of months across the top of the sheet,
// one dot per brand-month, colored by category. Hover a dot for the brand,
// the month, and the "why then" line. Reads like a ticket stub timeline.
export type TL = { brand_id: string; brand: string; category: string | null; months: string[]; why: string | null; season: string | null; repeat: boolean; deals: number };

const COLORS: Record<string, string> = {
  Tech: "#2f5bff", Food: "#e07a2f", Fashion: "#b13589", Home: "#0e6b45", Beauty: "#d64577", Business: "#5b6472", Travel: "#1f9ecf", Entertainment: "#7c3aed", Wellness: "#2bb673", Fitness: "#ef4444", Sports: "#f59e0b", Finance: "#0b0d12", Auto: "#374151", Baby: "#f472b6", Health: "#10b981", Lifestyle: "#8b5cf6", Pets: "#a16207", Education: "#0ea5e9", Outdoors: "#4d7c0f", Gaming: "#6366f1", Coffee: "#78350f", DIY: "#b45309",
};
const color = (c: string | null) => (c && COLORS[c]) || "#8b93a1";

export function PrintTimeline({ items, onPick }: { items: TL[]; onPick?: (brandId: string) => void }) {
  const [hover, setHover] = useState<{ b: TL; m: string } | null>(null);
  const months = useMemo(() => {
    const out: string[] = []; const d = new Date(); d.setDate(1);
    for (let i = 23; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`); }
    return out;
  }, []);
  const rows = useMemo(() => {
    // one lane per brand, ordered by first month; cap lanes so the strip stays short
    const withIdx = items.map((it) => ({ it, first: Math.min(...it.months.map((m) => months.indexOf(m)).filter((i) => i >= 0), 99) })).filter((r) => r.first < 99);
    return withIdx.sort((a, b) => a.first - b.first).slice(0, 18).map((r) => r.it);
  }, [items, months]);
  if (!rows.length) return null;

  const W = 920, LEFT = 118, RIGHT = 12, TOP = 26, LANE = 14, H = TOP + rows.length * LANE + 8;
  const x = (i: number) => LEFT + ((i + 0.5) / 24) * (W - LEFT - RIGHT);
  const seasons = [{ m: "01", l: "New Year" }, { m: "08", l: "Back to school" }, { m: "11", l: "Holiday" }];
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))] as string[];

  return (
    <div className="pw-map">
      <div className="flex items-baseline justify-between">
        <div className="rc-head">the map · last 24 months</div>
        <div className="flex flex-wrap gap-x-3 rc-head">{cats.slice(0, 8).map((c) => <span key={c}><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color(c) }} />{c}</span>)}</div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" onMouseLeave={() => setHover(null)}>
          {months.map((m, i) => {
            const [y, mm] = m.split("-"); const jan = mm === "01"; const s = seasons.find((s) => s.m === mm);
            return (
              <g key={m}>
                <line x1={x(i)} x2={x(i)} y1={TOP - 6} y2={H - 6} stroke={jan ? "#cfd3d9" : "#eceef2"} strokeDasharray={jan ? undefined : "2 3"} />
                {(mm === "01" || mm === "07") && <text x={x(i)} y={12} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fill="#8b93a1">{mm === "01" ? y : `mid ${y}`}</text>}
                {s && i % 12 === months.findIndex((q) => q.endsWith(`-${s.m}`)) % 12 && <text x={x(i)} y={H - 0} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8.5" fill="#b0b5be">{s.l}</text>}
              </g>
            );
          })}
          {rows.map((r, li) => {
            const cy = TOP + li * LANE + LANE / 2;
            const idx = r.months.map((m) => months.indexOf(m)).filter((i) => i >= 0).sort((a, b) => a - b);
            return (
              <g key={r.brand_id} style={{ cursor: onPick ? "pointer" : "default" }} onClick={() => onPick?.(r.brand_id)}>
                <text x={LEFT - 8} y={cy + 3.5} textAnchor="end" fontFamily="var(--font-sans), Inter, sans-serif" fontSize="10.5" fontWeight="500" fill="#0b0d12">{r.brand.length > 16 ? r.brand.slice(0, 15) + "…" : r.brand}</text>
                {idx.length > 1 && <line x1={x(idx[0])} x2={x(idx[idx.length - 1])} y1={cy} y2={cy} stroke={color(r.category)} strokeOpacity=".25" strokeWidth="3" strokeLinecap="round" />}
                {idx.map((i) => (
                  <circle key={i} cx={x(i)} cy={cy} r={hover?.b.brand_id === r.brand_id ? 5.5 : 4.5} fill={color(r.category)} stroke={r.repeat ? "#0b0d12" : "#fbfbfa"} strokeWidth={r.repeat ? 1.6 : 1.2}
                    onMouseEnter={() => setHover({ b: r, m: months[i] })} />
                ))}
              </g>
            );
          })}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute left-0 top-0 m-2 max-w-sm rounded-md border border-line bg-surface px-3 py-2 shadow-pop">
            <div className="text-[13px] font-medium">{hover.b.brand} <span className="num text-[10.5px] text-muted">· {new Date(hover.m + "-02").toLocaleDateString(undefined, { month: "long", year: "numeric" })}{hover.b.season ? ` · ${hover.b.season}` : ""}</span></div>
            {hover.b.why ? <div className="mt-1 text-[12px] leading-relaxed text-muted">{hover.b.why}</div> : <div className="mt-1 num text-[11px] text-dim">why-then note is being written…</div>}
          </div>
        )}
      </div>
    </div>
  );
}
