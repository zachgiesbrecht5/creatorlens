import Link from "next/link";
import { fmt } from "@/lib/fmt";
import { pace, sizeBand, shortDate } from "@/lib/brand-intel";

// Tables for the brand finder (app/brands/page.tsx). Columns that matter least drop off on phones.
export function InsiderBrandHead() {
  return <tr><th>Brand</th><th title="Last 90 days against the 90 before">Pace</th><th className="text-right" title="Separate bookings in the last 90 days">Bookings 90d</th><th className="hidden text-right sm:table-cell" title="Creators paid, all time">Creators</th><th className="hidden text-right sm:table-cell" title="Share of paid creators booked more than once">Rebook rate</th><th className="hidden md:table-cell" title="Median following of creators they've paid">Typical size</th><th className="hidden md:table-cell">Last booking</th></tr>;
}

export function InsiderBrandRow({ b }: { b: any }) {
  return (
                <tr key={b.id}>
                  <td className="min-w-[160px]">
                    <Link href={`/brands/${b.id}`} className="font-medium hover:text-accent">{b.name}</Link>
                    {b.is_mass_sponsor && <span className="pill ml-2" title="Sponsors nearly everyone; low signal">mass</span>}
                    {b.is_affiliate && <span className="pill ml-2" title="One creator accounts for nearly all of these deals">affiliate</span>}
                    <div className="num mt-0.5 text-[11px] text-dim">{b.category || (b.classified_at ? "Uncategorized" : "classifying…")}{b.website ? ` · ${b.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")}` : ""}</div>
                  </td>
                  <td><PaceCell now={b.bookings_90d} prev={b.bookings_prev_90d} /></td>
                  <td className="num text-right font-semibold">{b.bookings_90d || <span className="font-normal text-dim">0</span>}</td>
                  <td className="num hidden text-right sm:table-cell">{b.paid_creators || b.creator_count}</td>
                  <td className="num hidden text-right sm:table-cell">{b.rebook_rate != null ? `${Math.round(Number(b.rebook_rate) * 100)}%` : <span className="text-dim">–</span>}</td>
                  <td className="num hidden whitespace-nowrap text-[12px] text-muted md:table-cell">{sizeBand(b.median_followers) || "–"}</td>
                  <td className="num hidden whitespace-nowrap text-[12px] text-muted md:table-cell">{b.last_booked_at ? shortDate(b.last_booked_at, true) : b.last_seen || ""}</td>
                </tr>
  );
}

export function RebookingTable({ rows }: { rows: any[] }) {
  return (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Creator</th><th>Brand</th><th className="text-right">Booking</th><th className="hidden sm:table-cell">When</th><th className="hidden sm:table-cell">Post</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.creator_id + r.brand_id + r.booked_at}>
                    <td><Link href={`/c/${r.creator.platform}/${r.creator.handle}`} className="flex max-w-[150px] items-center gap-2.5 hover:text-accent sm:max-w-none sm:min-w-[180px]">{r.creator.avatar_url ? <img src={r.creator.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /> : <span className="h-8 w-8 shrink-0 rounded-full bg-surface2" />}<span className="min-w-0"><span className="block truncate font-medium">{r.creator.display_name || r.creator.handle}</span><span className="num block text-[11px] text-muted">{r.creator.platform === "youtube" ? "YouTube" : "Instagram"} · {fmt(r.creator.followers)}{r.creator.category && r.creator.category !== "Other" ? ` · ${r.creator.category}` : ""}</span></span></Link></td>
                    <td><Link href={`/brands/${r.brand.id}`} className="font-medium hover:text-accent">{r.brand.name}</Link>{r.brand.category && <span className="pill ml-2">{r.brand.category}</span>}</td>
                    <td className="num text-right"><span className="font-semibold">{ordinal(r.booking_no)}</span></td>
                    <td className="num hidden text-[12px] text-muted sm:table-cell">{shortDate(r.booked_at, true)}</td>
                    <td className="hidden sm:table-cell">{r.content_url && <a href={r.content_url} target="_blank" rel="noreferrer" className="num text-[12px] text-muted hover:text-accent">open ↗</a>}</td>
                  </tr>))}</tbody>
              </table>
            </div>
  );
}

export function PaceCell({ now, prev }: { now: number; prev: number }) {
  const p = pace(now, prev);
  const cls = p.tone === "ok" ? "text-ok" : p.tone === "warn" ? "text-warn" : p.tone === "accent" ? "text-accent" : "text-muted";
  const arrow = p.key === "rising" ? "↑" : p.key === "cooling" ? "↓" : p.key === "new" ? "•" : p.key === "quiet" ? "" : "→";
  return <span className={`num whitespace-nowrap text-[12px] ${cls}`} title={`${now} bookings in the last 90 days, ${prev} in the 90 before`}>{arrow} {p.label}</span>;
}

export function ordinal(n: number) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
