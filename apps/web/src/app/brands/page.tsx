import Link from "next/link";
import { supabaseAdmin, currentAccess } from "@/lib/supabase";
import { Verticals } from "@/components/Verticals";

export const dynamic = "force-dynamic";

// Brand leaderboard: who is spending across every creator anyone has scanned,
// filed by what the brand sells, with the creator verticals it actually books.
export default async function Brands({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; sort?: string }> }) {
  const { q, cat, sort } = await searchParams;
  const admin = supabaseAdmin();
  const { profile: user, insider } = await currentAccess();
  const PREVIEW = 10;  // signed-out visitors see the top rows, the rest is frosted
  // Outsiders (signed in, not house): brand names, category and verticals only.
  // Counts, recency, and the reverse view stay in the house.

  // category counts for the filter row (cheap: brands table only)
  const { data: catRows } = await admin.from("brands").select("category").eq("is_junk", false).eq("is_self_brand", false).neq("site_status", "dead").not("category", "is", null);
  const counts = new Map<string, number>();
  for (const r of catRows || []) counts.set(r.category!, (counts.get(r.category!) || 0) + 1);
  const cats = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  let query = admin.from("brands")
    .select("id,name,category,verticals,deal_count,creator_count,last_seen,is_mass_sponsor,is_affiliate,classified_at,domain,website,site_status")
    .eq("is_junk", false).eq("is_self_brand", false).neq("site_status", "dead").limit(300);
  if (q) query = query.ilike("name", `%${q}%`);
  if (cat) query = query.eq("category", cat);
  query = sort === "recent" ? query.order("last_seen", { ascending: false, nullsFirst: false })
    : sort === "deals" ? query.order("deal_count", { ascending: false })
    : query.order("creator_count", { ascending: false }).order("deal_count", { ascending: false });
  const { data } = await query;
  const href = (p: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, cat, sort, ...p })) if (v) sp.set(k, v);
    const s = sp.toString();
    return "/brands" + (s ? "?" + s : "");
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-1.5">Leaderboard</div>
          <h1 className="h2">Brands</h1>
          <p className="mt-1 text-sm text-muted">{insider ? "Who is booking creators across everything indexed. Category is what the brand sells; Books is the creator verticals it has hired at least twice." : "Brands seen sponsoring creators across the index. Scan a creator to see their deals and contacts."}</p>
        </div>
        <form className="flex gap-2">
          {cat && <input type="hidden" name="cat" value={cat} />}
          {sort && <input type="hidden" name="sort" value={sort} />}
          <input name="q" defaultValue={q || ""} placeholder="Search brands" className="input !w-64" />
        </form>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        <Chip href={href({ cat: undefined })} active={!cat}>All</Chip>
        {cats.map(([c, n]) => <Chip key={c} href={href({ cat: c })} active={cat === c}>{c} <span className="num text-dim">{n}</span></Chip>)}
        {insider && <div className="ml-auto flex rounded-md bg-surface2 p-0.5 font-mono text-[11px]">
          {[["", "creators"], ["deals", "deals"], ["recent", "recent"]].map(([s, l]) => (
            <Link key={l} href={href({ sort: s || undefined })} className={`rounded px-2.5 py-1 transition ${(sort || "") === s ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}>{l}</Link>
          ))}
        </div>}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Brand</th><th>Category</th><th title="Creator verticals with 2+ distinct creators booked">Books</th>{insider && <><th className="text-right">Creators</th><th className="text-right">Deals</th><th>Last seen</th></>}<th>Site</th></tr>
          </thead>
          <tbody>
            {(data || []).slice(0, user ? undefined : PREVIEW).map((b) => (
              <tr key={b.id}>
                <td className="font-medium">{insider ? <Link href={`/brands/${b.id}`} className="hover:text-accent">{b.name}</Link> : b.name}{b.is_mass_sponsor && <span className="pill ml-2" title="Sponsors everyone; low signal">mass</span>}{b.is_affiliate && <span className="pill ml-2" title="One creator accounts for nearly all of these deals: affiliate, ambassador or house brand">affiliate</span>}</td>
                <td>{b.category ? <Link href={href({ cat: b.category })} className="pill hover:border-accent hover:text-accent">{b.category}</Link> : <span className="num text-[10px] text-dim">{b.classified_at ? "Uncategorized" : "classifying…"}</span>}</td>
                <td><Verticals v={b.verticals} max={3} min={2} /></td>
                {insider && <><td className="num text-right">{b.creator_count}</td>
                <td className="num text-right">{b.deal_count}</td>
                <td className="num text-[11px] text-muted">{b.last_seen || ""}</td></>}
                <td className="num text-[11px] text-dim">{b.website ? <a href={b.website} target="_blank" rel="noreferrer" className="hover:text-accent">{b.website.replace(/^https?:\/\/(www\.)?/, "")} ↗</a> : b.site_status === "unknown" ? "checking…" : ""}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={insider ? 7 : 4} className="py-10 text-center text-sm text-muted">Nothing here yet.</td></tr>}
          </tbody>
        </table>
        {!user && (data?.length || 0) > PREVIEW && (
          <div className="relative">
            <div className="pointer-events-none select-none blur-[3px]" aria-hidden>
              <table className="tbl">
                <tbody>
                  {data!.slice(PREVIEW, PREVIEW + 4).map((b) => (
                    <tr key={b.id}><td className="font-medium">{b.name}</td><td>{b.category && <span className="pill">{b.category}</span>}</td><td><Verticals v={b.verticals} max={3} min={2} /></td><td /></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-transparent via-surface/80 to-surface">
              <div className="text-sm font-medium">{data!.length - PREVIEW} more brands. Scan a creator to see their deals and contacts.</div>
              <Link href="/login?next=/brands" className="btn-primary">Sign in with Google to see everything</Link>
              <div className="font-mono text-[11px] text-dim">Free while in beta · drafts only, never sends</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] transition ${active ? "border-fg bg-fg text-white" : "border-line bg-surface text-muted hover:border-line2 hover:text-fg"}`}>{children}</Link>
  );
}
