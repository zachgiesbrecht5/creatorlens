import Link from "next/link";
// "Hiring now": brands with an open influencer/creator marketing role, and the
// timing advice that goes with it.
export function HiringStrip({ signals }: { signals: { id: string; company: string; brand_id: string | null; title: string; seniority: string | null; url: string; posted_at: string | null; found_at: string; closed_at: string | null; summary: string | null }[] }) {
  if (!signals.length) return null;
  const when = (s: (typeof signals)[number]) => {
    const days = Math.round((Date.now() - new Date(s.posted_at || s.found_at).getTime()) / 864e5);
    if (s.closed_at) { const since = Math.round((Date.now() - new Date(s.closed_at).getTime()) / 864e5); return since < 21 ? `hired ~${since}d ago · wait 3 weeks, then pitch the new person` : `hired ~${since}d ago · pitch the new hire now, they're building a list`; }
    return days < 14 ? "posted this week · pitch their boss with a creator ready now" : `open ${days}d · budget approved, seat empty · pitch VP Marketing`;
  };
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between"><div><div className="label">Hiring now</div><div className="text-[13px] text-muted">Brands hiring influencer or creator marketers. A posting means budget; a filled seat means a new person building a list.</div></div><Link href="/brands?hiring=1" className="num text-[11px] text-accent hover:underline">all signals →</Link></div>
      <div className="grid gap-3 md:grid-cols-3">
        {signals.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-baseline justify-between gap-2"><div className="truncate text-[14px] font-semibold tracking-tight">{s.brand_id ? <Link href={`/brands/${s.brand_id}`} className="hover:text-accent">{s.company}</Link> : s.company}</div>{s.seniority && <span className="pill">{s.seniority}</span>}</div>
            <div className="mt-0.5 truncate text-[12.5px] text-muted">{s.title}</div>
            {s.summary && <div className="mt-2 line-clamp-2 text-[11.5px] leading-snug text-dim">{s.summary}</div>}
            <div className="num mt-3 text-[10.5px] text-ok">{when(s)}</div>
            <a href={s.url} target="_blank" rel="noreferrer" className="num mt-1 inline-block text-[10.5px] text-dim hover:text-accent">posting ↗</a>
          </div>
        ))}
      </div>
    </section>
  );
}
