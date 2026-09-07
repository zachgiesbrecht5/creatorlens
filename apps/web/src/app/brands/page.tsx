import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { Verticals } from "@/components/Verticals";

export const dynamic = "force-dynamic";

// Brand leaderboard: who is spending across every creator anyone has scanned,
// filed by what the brand sells, with the creator verticals it actually books.
export default async function Brands({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; sort?: string }> }) {
  const { q, cat, sort } = await searchParams;
  const admin = supabaseAdmin();

  // category counts for the filter row (cheap: brands table only)
  const { data: catRows } = await admin.from("brands").select("category").eq("is_junk", false).eq("is_self_brand", false).neq("site_status", "dead").not("category", "is", null);
  const counts = new Map<string, number>();
  for (const r of catRows || []) counts.set(r.category!, (counts.get(r.category!) || 0) + 1);
  const cats = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  let query = admin.from("brands")
    .select("id,name,category,verticals,deal_count,creator_count,last_seen,is_mass_sponsor,domain,website,site_status")
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
          <p className="mt-1 text-sm text-muted">Who is booking creators across everything indexed, and which verticals they book.</p>
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
        <div className="ml-auto flex rounded-md bg-surface2 p-0.5 font-mono text-[11px]">
          {[["", "creators"], ["deals", "deals"], ["recent", "recent"]].map(([s, l]) => (
            <Link key={l} href={href({ sort: s || undefined })} className={`rounded px-2.5 py-1 transition ${(sort || "") === s ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}>{l}</Link>
          ))}
        </div>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Brand</th><th>Category</th><th>Books</th><th className="text-right">Creators</th><th className="text-right">Deals</th><th>Last seen</th><th>Site</th></tr>
          </thead>
          <tbody>
            {(data || []).map((b) => (
              <tr key={b.id}>
                <td className="font-medium"><Link href={`/brands/${b.id}`} className="hover:text-accent">{b.name}</Link>{b.is_mass_sponsor && <span className="pill ml-2" title="Sponsors everyone; low signal">mass</span>}</td>
                <td>{b.category ? <Link href={href({ cat: b.category })} className="pill hover:border-accent hover:text-accent">{b.category}</Link> : <span className="num text-[10px] text-dim">classifying…</span>}</td>
                <td><Verticals v={b.verticals} max={3} /></td>
                <td className="num text-right">{b.creator_count}</td>
                <td className="num text-right">{b.deal_count}</td>
                <td className="num text-[11px] text-muted">{b.last_seen || ""}</td>
                <td className="num text-[11px] text-dim">{b.website ? <a href={b.website} target="_blank" rel="noreferrer" className="hover:text-accent">{b.website.replace(/^https?:\/\/(www\.)?/, "")} ↗</a> : b.site_status === "unknown" ? "checking…" : ""}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={7} className="py-10 text-center text-sm text-muted">Nothing here yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] transition ${active ? "border-fg bg-fg text-white" : "border-line bg-surface text-muted hover:border-line2 hover:text-fg"}`}>{children}</Link>
  );
}
