import Link from "next/link";
import { BrandSearch } from "@/components/BrandSearch";
import { SearchBox } from "@/components/SearchBox";
import { pace, shortDate } from "@/lib/brand-intel";

// Signed-in home: the two jobs people come for (find a brand, check a creator) up top, then what's moving.
export function Workspace({ insider, spending, rebooked }: { insider: boolean; spending: any[]; rebooked: any[] }) {
  return (
    <section>
      <div className="label mb-1.5">Workspace</div>
      <h1 className="h2 text-3xl">Find your next brand partner</h1>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="card min-w-0 p-5" data-tour="brand">
          <div className="text-[15px] font-semibold tracking-tight">Look up a brand</div>
          <p className="mt-0.5 text-[13px] text-muted">Who they book, how often, when they spend, and who runs it.</p>
          <div className="mt-3"><BrandSearch size="lg" placeholder="Samsung, LMNT, Rocket Mortgage…" /></div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]"><Link href="/brands" className="text-accent hover:underline">Recent sponsorship activity →</Link>{insider && <Link href="/brands?view=rebooking" className="text-accent hover:underline">Creators being rebooked →</Link>}</div>
        </div>
        <div className="card min-w-0 p-5" data-tour="search">
          <div className="text-[15px] font-semibold tracking-tight">Print a creator</div>
          <p className="mt-0.5 text-[13px] text-muted">Every brand that has paid them, the post that proves it, and who to email.</p>
          <div className="mt-3"><SearchBox signedIn cta="Print" /></div>
        </div>
      </div>
      {insider && (spending.length > 0 || rebooked.length > 0) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card min-w-0 overflow-hidden">
            <div className="flex items-baseline justify-between px-5 pb-2 pt-4"><div className="text-[15px] font-semibold tracking-tight">Ramping up</div><Link href="/brands?sort=rising" className="text-[12.5px] text-accent hover:underline">all rising brands</Link></div>
            <ul className="divide-y divide-line">{spending.map((b) => { const p = pace(b.bookings_90d, b.bookings_prev_90d); return (
              <li key={b.id}><Link href={`/brands/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-accentSoft/40">
                <span className="min-w-0"><span className="block truncate text-[14px] font-medium">{b.name}</span><span className="num block text-[11.5px] text-muted">{b.category || "Uncategorized"} · {b.paid_creators} creators{b.rebook_rate != null ? ` · ${Math.round(Number(b.rebook_rate) * 100)}% rebook` : ""}</span></span>
                <span className="shrink-0 text-right"><span className="num block text-[15px] font-semibold">{b.bookings_90d}</span><span className={`num block text-[11px] ${p.tone === "ok" ? "text-ok" : p.tone === "warn" ? "text-warn" : "text-muted"}`}>{p.key === "rising" ? "↑" : ""} {b.bookings_prev_90d} → {b.bookings_90d} in 90d</span></span>
              </Link></li>); })}</ul>
          </div>
          <div className="card min-w-0 overflow-hidden">
            <div className="flex items-baseline justify-between px-5 pb-2 pt-4"><div className="text-[15px] font-semibold tracking-tight">Just rebooked</div><Link href="/brands?view=rebooking" className="text-[12.5px] text-accent hover:underline">see all</Link></div>
            <ul className="divide-y divide-line">{rebooked.map((r) => (
              <li key={r.creator_id + r.brand_id + r.booked_at} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <Link href={`/c/${r.creator.platform}/${r.creator.handle}`} className="flex min-w-0 items-center gap-2.5 hover:text-accent">{r.creator.avatar_url ? <img src={r.creator.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" /> : <span className="h-7 w-7 shrink-0 rounded-full bg-surface2" />}<span className="truncate text-[14px] font-medium">{r.creator.display_name || r.creator.handle}</span></Link>
                <span className="shrink-0 text-right text-[13px]"><Link href={`/brands/${r.brand.id}`} className="font-medium hover:text-accent">{r.brand.name}</Link><span className="num block text-[11px] text-muted">booking #{r.booking_no} · {shortDate(r.booked_at)}</span></span>
              </li>))}</ul>
          </div>
        </div>
      )}
    </section>
  );
}
