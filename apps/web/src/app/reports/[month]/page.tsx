import Link from "next/link";
import type { Metadata } from "next";
import { monthlyReport } from "@/lib/report";

const base = process.env.NEXT_PUBLIC_APP_URL || "https://sponsorprint.com";
type P = { params: Promise<{ month: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { month } = await params;
  const r = await monthlyReport(month);
  const title = `Most active creator sponsors, ${r.label}`;
  const desc = `${r.brands} brands made ${r.deals} disclosed creator deals in ${r.label}. Top sponsor by vertical, new entrants, and who's spending most, from the Sponsorprint index.`;
  const og = `${base}/api/og/report?month=${month}`;
  return { title, description: desc, openGraph: { title, description: desc, images: [{ url: og, width: 1200, height: 630 }] }, twitter: { card: "summary_large_image", title, description: desc, images: [og] }, alternates: { canonical: `${base}/reports/${month}` } };
}

export default async function Report({ params }: P) {
  const { month } = await params;
  const r = await monthlyReport(month);
  const delta = r.prevDeals ? Math.round(((r.deals - r.prevDeals) / r.prevDeals) * 100) : null;
  return (
    <article className="mx-auto max-w-4xl">
      <div className="label mb-2">Sponsorprint index · monthly report</div>
      <h1 className="h1">Most active creator sponsors, {r.label}</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{r.brands} brands made {r.deals} disclosed creator deals across {r.creators} creators this month{delta != null ? `, ${delta >= 0 ? "up" : "down"} ${Math.abs(delta)}% on the month before` : ""}. Counted from public #ad, #partner and "sponsored by" disclosures on YouTube and Instagram; the paid-partnership label without a hashtag is not visible, so treat these as floors.</p>

      <section className="mt-10">
        <h2 className="h2">Who's spending most</h2>
        <div className="card mt-3 overflow-x-auto"><table className="tbl"><thead><tr><th>#</th><th>Brand</th><th>Category</th><th className="text-right">Creators</th><th className="text-right">Deals</th></tr></thead>
          <tbody>{r.top.map((b, i) => <tr key={b.brand_id}><td className="num text-muted">{i + 1}</td><td className="font-medium"><Link href={`/brands/${b.brand_id}`} className="hover:text-accent">{b.brand}</Link></td><td className="text-[12px] text-muted">{b.category || ""}</td><td className="num text-right">{b.creators}</td><td className="num text-right">{b.deals}</td></tr>)}</tbody></table></div>
      </section>

      <section className="mt-10">
        <h2 className="h2">By vertical</h2>
        <p className="mt-1 text-[13px] text-muted">The creator lane, and the brands booking it most this month.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {r.verticals.map((v) => (
            <div key={v.vertical} className="card p-4">
              <div className="flex items-baseline justify-between"><div className="text-[15px] font-semibold tracking-tight">{v.vertical}</div><div className="num text-[11px] text-muted">{v.deals} deals</div></div>
              <ol className="mt-2 space-y-1">{v.top.map((b, i) => <li key={b.brand_id} className="flex items-baseline justify-between text-[13px]"><span><span className="num mr-2 text-muted">{i + 1}</span><Link href={`/brands/${b.brand_id}`} className="hover:text-accent">{b.brand}</Link></span><span className="num text-[11px] text-muted">{b.creators} creator{b.creators === 1 ? "" : "s"}</span></li>)}</ol>
            </div>
          ))}
        </div>
      </section>

      {r.newcomers.length > 0 && (
        <section className="mt-10">
          <h2 className="h2">New this month</h2>
          <p className="mt-1 text-[13px] text-muted">Brands with their first disclosed creator deal in the index. New budgets, new programs, worth a pitch.</p>
          <div className="mt-3 flex flex-wrap gap-2">{r.newcomers.map((b) => <Link key={b.brand_id} href={`/brands/${b.brand_id}`} className="pill hover:border-fg">{b.brand} <span className="num text-dim">· {b.deals}</span></Link>)}</div>
        </section>
      )}

      <div className="mt-12 rounded-xl bg-fg p-5 text-white">
        <div className="text-[15px] font-semibold">Pull any creator's sponsor print in twenty seconds.</div>
        <div className="mt-1 text-[13px] text-white/70">Every brand that has paid them, the post that proves it, and who to email. Free to start.</div>
        <Link href="/login" className="mt-3 inline-block rounded-md bg-white px-4 py-2 text-[13px] font-semibold text-fg">Try Sponsorprint →</Link>
      </div>
      <p className="num mt-6 text-[10.5px] text-dim">Method: disclosures detected in public captions and descriptions read through the official YouTube and Instagram APIs. Brand names as written by creators, deduplicated. Not a complete record of any brand's spending.</p>
    </article>
  );
}
