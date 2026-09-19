import Link from "next/link";
export type SignalRow = { id: string; brand: string; brand_id: string | null; property: string; property_type: string | null; market: string | null; category: string | null; announced_at: string | null; url: string; summary: string | null; activation_note: string | null };
export type MatchRow = { id: number; reason: string; score: number; seen: boolean; creator: string; signal: SignalRow };

const timing = (s: SignalRow) => {
  const d = s.announced_at ? Math.round((Date.now() - new Date(s.announced_at).getTime()) / 864e5) : null;
  if (d == null) return "pitch the sponsorship activation lead now";
  if (d <= 14) return `signed ${d}d ago · pitch this week, before the activation brief is written`;
  if (d <= 56) return `signed ${d}d ago · activation is being planned now, pitch the brand or their sports agency`;
  return `signed ${d}d ago · program likely live, pitch for the next wave`;
};

export function SignalsStrip({ matches, general }: { matches: MatchRow[]; general: SignalRow[] }) {
  if (!matches.length && !general.length) return null;
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between"><div><div className="label">Signals</div><div className="text-[13px] text-muted">Brands that just signed a team, league or event. A regional deal means they need local creators within weeks.</div></div><Link href="/signals" className="num text-[11px] text-accent hover:underline">all signals →</Link></div>
      <div className="grid gap-3 md:grid-cols-3">
        {matches.slice(0, 3).map((m) => (
          <div key={m.id} className="card border-ok/50 p-4">
            <div className="flex items-baseline justify-between gap-2"><div className="truncate text-[14px] font-semibold tracking-tight">{m.signal.brand_id ? <Link href={`/brands/${m.signal.brand_id}`} className="hover:text-accent">{m.signal.brand}</Link> : m.signal.brand} <span className="font-normal text-muted">× {m.signal.property}</span></div>{!m.seen && <span className="pill-ok">for you</span>}</div>
            <div className="num mt-0.5 text-[10.5px] text-muted">{m.signal.market}{m.signal.category ? ` · ${m.signal.category}` : ""}{m.signal.announced_at ? ` · ${new Date(m.signal.announced_at).toLocaleDateString()}` : ""}</div>
            <div className="mt-2 text-[12px] leading-snug"><b>{m.creator}</b>: {m.reason}</div>
            <div className="num mt-2 text-[10.5px] text-ok">{timing(m.signal)}</div>
            <div className="mt-1 flex gap-3 num text-[10.5px]"><a href={m.signal.url} target="_blank" rel="noreferrer" className="text-dim hover:text-accent">announcement ↗</a>{m.signal.brand_id && <Link href={`/brands/${m.signal.brand_id}`} className="text-accent hover:underline">who to email →</Link>}</div>
          </div>
        ))}
        {general.slice(0, Math.max(0, 3 - Math.min(3, matches.length))).map((s) => (
          <div key={s.id} className="card p-4">
            <div className="truncate text-[14px] font-semibold tracking-tight">{s.brand_id ? <Link href={`/brands/${s.brand_id}`} className="hover:text-accent">{s.brand}</Link> : s.brand} <span className="font-normal text-muted">× {s.property}</span></div>
            <div className="num mt-0.5 text-[10.5px] text-muted">{s.market}{s.category ? ` · ${s.category}` : ""}{s.announced_at ? ` · ${new Date(s.announced_at).toLocaleDateString()}` : ""}</div>
            {s.summary && <div className="mt-2 line-clamp-2 text-[11.5px] leading-snug text-dim">{s.summary}</div>}
            <div className="num mt-2 text-[10.5px] text-ok">{timing(s)}</div>
            <a href={s.url} target="_blank" rel="noreferrer" className="num mt-1 inline-block text-[10.5px] text-dim hover:text-accent">announcement ↗</a>
          </div>
        ))}
      </div>
    </section>
  );
}
