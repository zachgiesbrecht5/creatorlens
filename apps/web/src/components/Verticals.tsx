// Which creator verticals a brand books, as compact chips: "Tech ×3 · Lifestyle".
// `min`: a vertical needs at least this many distinct creators before it is shown
// as something the brand "books" (one creator is an anecdote, not a pattern).
export function Verticals({ v, max = 3, bar, min = 1 }: { v: Record<string, number> | null | undefined; max?: number; bar?: boolean; min?: number }) {
  const entries = Object.entries(v || {}).filter(([k, n]) => k && k !== "Other" && n >= min).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <span className="num text-[10px] text-dim">–</span>;
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (bar) {
    return (
      <div>
        <div className="flex h-1.5 w-full overflow-hidden rounded bg-line">
          {entries.map(([k, n], i) => <div key={k} title={`${k}: ${n}`} style={{ width: `${(n / total) * 100}%`, opacity: 1 - i * 0.18 }} className="bg-accent" />)}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entries.map(([k, n]) => <span key={k} className="pill-accent">{k} <span className="opacity-70">×{n}</span></span>)}
        </div>
      </div>
    );
  }
  const shown = entries.slice(0, max);
  const rest = entries.length - shown.length;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map(([k, n]) => <span key={k} className="pill-accent" title={`${n} creator${n === 1 ? "" : "s"} in ${k}`}>{k}{n > 1 && <span className="ml-0.5 opacity-70">×{n}</span>}</span>)}
      {rest > 0 && <span className="pill" title={entries.slice(max).map(([k, n]) => `${k} ×${n}`).join(", ")}>+{rest}</span>}
    </span>
  );
}
