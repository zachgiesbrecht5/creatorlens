import Link from "next/link";
import { fmt } from "@/lib/fmt";
import { Verticals } from "@/components/Verticals";
import { BookingMap, type Deal } from "@/components/BookingMap";
import { BrandScan } from "@/components/BrandScan";
import { windowStatus } from "@/lib/launches";
import { ShareBrand } from "@/components/ShareBrand";
import { BrandResearch } from "@/components/BrandResearch";
import { pace, peakMonths, nextPeak, sizeBand, shortDate, MONTHS, type BrandStats } from "@/lib/brand-intel";

export type Rebooker = { creator_id: string; bookings: number; first_at: string; last_at: string; avg_gap_days: number | null; next_due: string | null; creator: any };
export type BrandViewProps = {
  brand: any; stats: BrandStats | null; rows: any[]; rebook: Rebooker[]; retail: any[]; cobooked: any[];
  parentName: string | null; showParent: boolean; research: { summary: string | null; agency: string | null; agency_url: string | null } | null;
  launches: any[]; hiring: any[]; deals: Deal[]; scoped: boolean; share: { token: string; views: number } | null; lastScan: any; signedIn: boolean;
};

// Presentational half of the brand page (data loading lives in app/brands/[id]/page.tsx).
export function BrandView({ brand, stats, rows: allRows, rebook, retail, cobooked, parentName, showParent, research, launches, hiring, deals, scoped, share, lastScan, signedIn }: BrandViewProps) {
  // paid (High/Medium) bookings lead; Low-confidence rows are hashtags and mentions, shown separately
  const rows = allRows.filter((r: any) => r.best_label !== "Low");
  const mentions = allRows.filter((r: any) => r.best_label === "Low");
  const pc = (brand.platform_counts || {}) as Record<string, number>;
  const top = Object.entries((brand.verticals || {}) as Record<string, number>).filter(([k]) => k !== "Other").sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="space-y-6">
      {/* 1. who they are, in one line */}
      <div className="card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link href="/brands" className="label hover:text-accent">Brands</Link><span className="text-dim">/</span>
              {brand.category && <Link href={`/brands?cat=${encodeURIComponent(brand.category)}`} className="pill hover:border-accent hover:text-accent">{brand.category}</Link>}
              {brand.is_mass_sponsor && <span className="pill" title="Sponsors nearly everyone; a booking here says less about fit">mass sponsor</span>}
              {brand.is_affiliate && <span className="pill" title="One creator accounts for most of these deals">affiliate</span>}
              {brand.is_self_brand && <span className="pill-warn">creator-owned</span>}
            </div>
            <h1 className="h2 text-3xl">{brand.website ? <a href={brand.website} target="_blank" rel="noreferrer" className="hover:text-accent">{brand.name} <span className="font-mono text-sm text-dim">↗</span></a> : brand.name}</h1>
            <p className="mt-2 text-[14px] text-muted">
              {stats ? <>{stats.creators} creators paid · {stats.bookings} bookings</> : <>{brand.creator_count} creators · {brand.deal_count} posts</>}
              {stats?.last_at ? <> · last booking {shortDate(stats.last_at, true)}</> : brand.last_seen ? <> · last seen {brand.last_seen}</> : null}
              {pc.youtube || pc.instagram ? <span className="text-dim"> · {[pc.youtube ? `YouTube ${pc.youtube}` : null, pc.instagram ? `Instagram ${pc.instagram}` : null].filter(Boolean).join(" · ")} posts</span> : null}
            </p>
            {(top || showParent) && <p className="mt-2 text-[14px] text-muted">{top && <>Books mostly <span className="font-medium text-fg">{top[0]}</span> creators.</>}{showParent && <> Owned by <span className="font-medium text-fg">{parentName}</span>.</>}</p>}
          </div>
          <div className="w-full max-w-sm">
            <div className="label mb-2">Creator verticals booked</div>
            <Verticals v={brand.verticals} bar />
          </div>
        </div>
        <div className="mt-5 border-t border-dashed border-line pt-4"><ShareBrand brandId={brand.id} initialToken={share?.token || null} views={share?.views || 0} /></div>
      </div>

      {/* 2. spend pattern + who's behind it */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SpendCard stats={stats} />
        <section className="card p-5">
          <div className="label mb-1">Who's behind it</div>
          <p className="text-[13px] text-muted">Who else has a hand in {brand.name}'s creator work, from the posts themselves and from research.</p>
          <ul className="mt-4 space-y-3 text-[14px]">
            {showParent && <BehindRow k="Parent company" v={parentName!} note="Pitches can also go to the group's creator or brand team." />}
            {research?.agency && <BehindRow k="Agency" v={research.agency} href={research.agency_url} note="From research. Agencies change, so confirm before pitching." />}
            {retail.map((r: any) => <BehindRow key={r.name} k="Runs through" v={r.name} href={r.sample_url} note={`${r.posts} of their sponsored posts also carry the program's partner tag, so some of this budget is the retailer's.`} />)}
            {cobooked.length > 0 && (
              <li>
                <div className="label !text-[10px]">Tagged together with</div>
                <div className="mt-1 flex flex-wrap gap-1.5">{cobooked.map((c: any) => <Link key={c.other_brand_id} href={`/brands/${c.other_brand_id}`} className="rounded-md border border-line bg-surface2 px-2 py-0.5 text-[13px] hover:border-accent hover:text-accent">{c.name} <span className="num text-[11px] text-dim">{c.posts}</span></Link>)}</div>
                <div className="mt-1 text-[12px] text-dim">Brands named as partners in the same Instagram posts: often a retailer or a sister brand paying for the same campaign.</div>
              </li>
            )}
            {!showParent && !research?.agency && !retail.length && !cobooked.length && <li className="text-[13px] text-muted">Nothing in the posts points past {brand.name} itself. Their creator work looks direct.</li>}
          </ul>
          <div className="mt-4 border-t border-dashed border-line pt-3"><BrandResearch brandId={brand.id} done={!!research} summary={research?.summary || null} /></div>
        </section>
      </div>

      {/* 3. creators they come back to */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
          <div><div className="label mb-1">Rebooking</div><h2 className="text-[17px] font-semibold tracking-tight">Creators {brand.name} booked more than once</h2></div>
          {stats && stats.creators >= 3 && <div className="num text-[12px] text-muted">{Math.round((stats.rebook_creators / stats.creators) * 100)}% of paid creators came back</div>}
        </div>
        <p className="px-5 pb-3 pt-1 text-[13px] text-muted">A separate booking means a new run of sponsored posts at least three weeks after the last. The last column is simply how long ago the latest booking was, next to their usual gap. It is what happened, not a forecast.</p>
        {rebook.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Creator</th><th className="text-right">Times</th><th className="hidden md:table-cell">First</th><th className="hidden sm:table-cell">Latest</th><th className="hidden sm:table-cell">Usual gap</th><th>Since latest</th></tr></thead>
              <tbody>{rebook.map((r) => { const c: any = r.creator; if (!c) return null; const since = Math.max(0, Math.round((Date.now() - new Date(r.last_at).getTime()) / 864e5)); const sinceTxt = since < 60 ? `${since} days ago` : `${Math.round(since / 30)} months ago`; const past = r.avg_gap_days != null && since > r.avg_gap_days * 1.5; return (
                <tr key={r.creator_id}>
                  <td><CreatorCell c={c} /></td>
                  <td className="num text-right font-semibold">{r.bookings}</td>
                  <td className="num hidden text-[12px] text-muted md:table-cell">{shortDate(r.first_at, true)}</td>
                  <td className="num hidden whitespace-nowrap text-[12px] sm:table-cell">{shortDate(r.last_at, true)}</td>
                  <td className="num hidden text-[12px] text-muted sm:table-cell">{r.avg_gap_days != null ? `every ${r.avg_gap_days < 60 ? `${r.avg_gap_days} days` : `${Math.round(r.avg_gap_days / 30)} months`}` : ""}</td>
                  <td className="num whitespace-nowrap text-[12px]"><span className={past ? "text-dim" : "text-fg"} title={past ? "Longer than their usual gap" : "Within their usual gap"}>{sinceTxt}</span></td>
                </tr>); })}</tbody>
            </table>
          </div>
        ) : <p className="px-5 pb-5 text-[13px] text-muted">No creator in the index has been booked by {brand.name} twice yet.</p>}
      </section>

      {/* launches and hiring: timing signals */}
      {launches && launches.length > 0 && (
        <section className="card p-5">
          <div className="mb-2 flex items-baseline justify-between"><div><div className="label">What they're launching</div><div className="text-[13px] text-muted">From {brand.name}'s own Instagram. Second-wave pitch windows run 4 to 8 weeks after the post.</div></div>{brand.ig_handle && <a href={`https://instagram.com/${brand.ig_handle}`} target="_blank" rel="noreferrer" className="num text-[12px] text-muted hover:text-accent">@{brand.ig_handle} ↗</a>}</div>
          <div className="divide-y divide-line">{launches.map((l: any) => { const st = windowStatus(l); return (
            <div key={l.id} className="flex items-start justify-between gap-4 py-2.5">
              <div className="min-w-0"><div className="text-[14px] font-medium">{l.product || l.summary}</div>{l.spoken || l.on_video ? <div className="truncate text-[12.5px] text-fg">"{l.spoken || l.on_video}"</div> : null}<div className="num text-[11px] text-muted">{l.kind} · {shortDate(l.posted_at)} · <a href={l.url} target="_blank" rel="noreferrer" className="hover:text-accent">open post ↗</a></div></div>
              <span className={`ll-pill ${st === "open" ? "ll-open" : st === "soon" ? "ll-soon" : st === "repush" ? "ll-repush" : "ll-past"}`}>{st === "open" ? "window open" : st === "soon" ? `opens ${shortDate(l.window_start)}` : st === "repush" ? "re-push month" : "passed"}</span>
            </div>); })}</div>
        </section>
      )}
      {hiring && hiring.length > 0 && (
        <section className="card border-ok/40 p-5">
          <div className="label mb-1">Hiring now</div>
          {hiring.map((h: any) => <div key={h.id} className="text-[14px]"><a href={h.url} target="_blank" rel="noreferrer" className="font-medium hover:text-accent">{h.title}</a>{h.seniority && <span className="pill ml-2">{h.seniority}</span>} <span className="num text-[11px] text-muted">· {h.closed_at ? `filled ${shortDate(h.closed_at, true)}` : `open since ${shortDate(h.posted_at || h.found_at, true)}`}</span>{h.summary && <div className="text-[12px] text-dim">{h.summary}</div>}</div>)}
          <div className="mt-2 text-[12px] text-ok">{hiring.some((h: any) => !h.closed_at) ? "Budget approved and nobody in the seat yet: pitch the VP of Marketing with a creator ready now." : "The seat is filled: the new hire is building a list from scratch. Pitch them directly."}</div>
        </section>
      )}

      {/* 4. everyone they've booked: paid first, bare mentions folded away */}
      <section className="card overflow-hidden">
        <div className="px-5 pb-3 pt-5"><div className="label mb-1">Booked</div><h2 className="text-[17px] font-semibold tracking-tight">Creators {brand.name} has paid <span className="num text-[13px] font-normal text-dim">{rows?.length || 0}</span></h2><p className="mt-1 text-[13px] text-muted">Newest first. Open a creator for their full print and the post that proves it.</p></div>
        {rows?.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Creator</th><th className="hidden md:table-cell">Vertical</th><th className="text-right">Posts</th><th>Last post</th><th className="hidden lg:table-cell">Proof</th></tr></thead>
              <tbody>{rows.map((r: any) => r.creators && (
                <tr key={r.creator_id}>
                  <td><CreatorCell c={r.creators} repeat={r.repeat_partner} /></td>
                  <td className="hidden md:table-cell">{r.creators.category && r.creators.category !== "Other" ? <span className="pill">{r.creators.category}</span> : null}</td>
                  <td className="num text-right">{r.deals}</td>
                  <td className="num whitespace-nowrap text-[12px] text-muted">{shortDate(r.last_seen, true)}</td>
                  <td className="hidden max-w-[320px] lg:table-cell">{r.content_url ? <a href={r.content_url} target="_blank" rel="noreferrer" className="line-clamp-1 text-[12.5px] text-muted hover:text-accent">{r.evidence || "open post"} ↗</a> : <span className="line-clamp-1 text-[12.5px] text-muted">{r.evidence}</span>}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : <p className="px-5 pb-5 text-[13px] text-muted">{mentions.length ? "No confirmed paid posts yet, only the mentions below." : scoped ? "None of the creators you've printed have worked with this brand yet." : "No creator in the index has a deal with this brand yet."}</p>}
      </section>

      {mentions.length > 0 && (
        <details className="card group overflow-hidden">
          <summary className="cursor-pointer list-none px-5 py-4 text-[14px] hover:bg-surface2/60"><span className="font-medium">Also mentioned {brand.name}</span> <span className="num text-[12px] text-dim">{mentions.length}</span> <span className="text-[13px] text-muted">· tags and hashtags without a paid disclosure. Some are deals, many aren't.</span></summary>
          <ul className="divide-y divide-line border-t border-line">{mentions.map((r: any) => r.creators && (
            <li key={r.creator_id} className="flex items-center justify-between gap-3 px-5 py-2.5"><CreatorCell c={r.creators} />{r.content_url ? <a href={r.content_url} target="_blank" rel="noreferrer" className="hidden max-w-[50%] truncate text-[12.5px] text-muted hover:text-accent sm:block">{r.evidence || "open post"} ↗</a> : null}</li>))}</ul>
        </details>
      )}

      <BookingMap deals={deals} />

      {/* 5. go find more */}
      {signedIn && (
        <details className="group">
          <summary className="cursor-pointer list-none rounded-xl border border-dashed border-line2 px-5 py-4 text-[14px] text-muted hover:border-accent hover:text-fg">
            <span className="font-medium text-fg">Find more creators who tag {brand.name}</span> <span className="text-dim">· searches YouTube and Instagram for posts naming the brand, then prints the creators so their deals can be confirmed</span>
          </summary>
          <div className="mt-3"><BrandScan brandId={brand.id} brandName={brand.name} last={(lastScan as any) || null} /></div>
        </details>
      )}
    </div>
  );
}

function SpendCard({ stats }: { stats: BrandStats | null }) {
  if (!stats) return (
    <section className="card p-5"><div className="label mb-1">Spending pattern</div><p className="text-[13px] text-muted">No paid bookings confirmed yet, only mentions and tags. Pull a few more creators in this space and the pattern fills in.</p></section>
  );
  const p = pace(stats.bookings_90d, stats.bookings_prev_90d);
  const peaks = peakMonths(stats.by_month, stats.first_at);
  const np = nextPeak(peaks);
  const max = Math.max(1, ...(stats.by_month || []));
  const cur = new Date().getMonth();
  const toneCls = p.tone === "ok" ? "pill-ok" : p.tone === "warn" ? "pill-warn" : p.tone === "accent" ? "pill-accent" : "pill";
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3"><div className="label">Spending pattern</div><span className={toneCls}>{p.label}{p.change != null && p.key !== "steady" ? ` ${p.change > 0 ? "+" : ""}${Math.round(p.change * 100)}%` : ""}</span></div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat n={stats.bookings_90d} l="bookings, last 90 days" sub={`${stats.bookings_prev_90d} the 90 before`} />
        <Stat n={stats.creators_90d} l="creators, last 90 days" sub={`${stats.creators} all time`} />
        <Stat n={sizeBand(stats.median_followers) || "–"} l="typical creator size" sub="median following" small />
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between"><span className="text-[12px] text-muted">Bookings by month, all years</span>{peaks.length > 0 && <span className="text-[12px] text-fg">Busiest: {peaks.map((m) => MONTHS[m]).join(", ")}</span>}</div>
        <div className="flex h-16 items-end gap-1" aria-label="Bookings by calendar month">
          {(stats.by_month || Array(12).fill(0)).map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${MONTHS[i]}: ${n} booking${n === 1 ? "" : "s"}`}>
              <div className={`w-full rounded-sm ${peaks.includes(i) ? "bg-accent" : i === cur ? "bg-fg/60" : "bg-line2"}`} style={{ height: `${Math.max(3, (n / max) * 56)}px` }} />
              <span className={`text-[9.5px] ${i === cur ? "font-semibold text-fg" : "text-dim"}`}>{MONTHS[i][0]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-lg bg-surface2 px-3.5 py-3 text-[13.5px] leading-relaxed">
        {/* Observed activity only. The 90-day forecast stays off the page until it has been checked against history. */}
        <>Observed: <b>{stats.bookings_90d}</b> booking{stats.bookings_90d === 1 ? "" : "s"} in the last 90 days, <b>{stats.bookings_prev_90d}</b> in the 90 days before.</>
        {np && <> {np.inMonths === 0 ? <>This has been one of their busiest months in past years.</> : <>In past years their busiest stretch started in <b>{MONTHS[np.month]}</b>.</>}</>}
      </div>
      <p className="mt-2 text-[11.5px] text-dim">Counted from creators in the index only, so treat it as direction, not their full budget.</p>
    </section>
  );
}

function Stat({ n, l, sub, small }: { n: number | string; l: string; sub?: string; small?: boolean }) {
  return <div><div className={`num font-semibold leading-tight tracking-tight ${small ? "text-[15px]" : "text-[22px] leading-none"}`}>{n}</div><div className="mt-1 text-[12px] leading-snug text-muted">{l}</div>{sub && <div className="num mt-0.5 text-[11px] text-dim">{sub}</div>}</div>;
}

function BehindRow({ k, v, href, note }: { k: string; v: string; href?: string | null; note?: string }) {
  return (
    <li>
      <div className="label !text-[10px]">{k}</div>
      <div className="font-medium">{href ? <a href={href} target="_blank" rel="noreferrer" className="hover:text-accent">{v} <span className="text-dim">↗</span></a> : v}</div>
      {note && <div className="text-[12px] text-dim">{note}</div>}
    </li>
  );
}

function CreatorCell({ c, repeat }: { c: any; repeat?: boolean }) {
  return (
    <Link href={`/c/${c.platform}/${c.handle}`} className="flex max-w-[150px] items-center gap-2.5 hover:text-accent sm:max-w-none sm:min-w-[180px]">
      {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /> : <span className="h-8 w-8 shrink-0 rounded-full bg-surface2" />}
      <span className="min-w-0">
        <span className="block truncate font-medium">{c.display_name || c.handle}</span>
        <span className="num block text-[11px] text-muted">{c.platform === "youtube" ? "YouTube" : "Instagram"} · {fmt(c.followers)}{repeat ? <span className="text-ok"> · repeat</span> : null}</span>
      </span>
    </Link>
  );
}
