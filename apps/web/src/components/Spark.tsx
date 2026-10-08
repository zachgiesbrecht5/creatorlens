// Inline SVG line for a time series. Server-renderable, no library. Values are plotted in order; the
// last point is marked. Dates are optional labels for the first and last points.
export function Spark({ values, width = 640, height = 160, labels, format = (v: number) => String(v), stroke = "#2f5bff" }: { values: number[]; width?: number; height?: number; labels?: [string, string]; format?: (v: number) => string; stroke?: string }) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return <div className="num text-[12px] text-muted">Not enough history yet; this fills in after the next weekly print.</div>;
  const pad = 28, w = width - pad * 2, h = height - pad * 2;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const x = (i: number) => pad + (i / (pts.length - 1)) * w;
  const y = (v: number) => pad + h - ((v - min) / span) * h;
  const path = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${path} L${x(pts.length - 1).toFixed(1)},${(pad + h).toFixed(1)} L${pad},${(pad + h).toFixed(1)} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${format(pts[0])} to ${format(pts[pts.length - 1])}`}>
      <defs><linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={stroke} stopOpacity="0.18" /><stop offset="1" stopColor={stroke} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#sparkfill)" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="4" fill={stroke} />
      <text x={pad} y={height - 8} className="fill-current text-[10px]" style={{ fill: "#8a90a0", fontFamily: "ui-monospace, monospace" }}>{labels?.[0] || ""} · {format(pts[0])}</text>
      <text x={width - pad} y={height - 8} textAnchor="end" style={{ fill: "#8a90a0", fontSize: 10, fontFamily: "ui-monospace, monospace" }}>{labels?.[1] || ""} · {format(pts[pts.length - 1])}</text>
      <text x={pad} y={14} style={{ fill: "#8a90a0", fontSize: 10, fontFamily: "ui-monospace, monospace" }}>high {format(max)} · low {format(min)}</text>
    </svg>
  );
}
