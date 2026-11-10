import Link from "next/link";
import { BrandSearch } from "@/components/BrandSearch";
import { supabaseAdmin, currentAccess, unlockedCreatorIds } from "@/lib/supabase";
import { Verticals } from "@/components/Verticals";
import { BrandMap, type MapBrand } from "@/components/BrandMap";
import { InsiderBrandHead, InsiderBrandRow, RebookingTable } from "@/components/BrandTables";

export const dynamic = "force-dynamic";

const SORTS = [
  ["", "Recent sponsorship activity", "Most bookings in the last 90 days"],
  ["rising", "Rising", "Biggest jump over the 90 days before"],
  ["rebooks", "Rebooks most", "Most creators booked more than once"],
  ["creators", "Most creators", "Most creators paid, all time"],
  ["recent", "Latest", "Most recent booking first"],
] as const;
const BOOKS = ["Parenting", "Dad", "Tech", "Fashion", "Beauty", "Food", "Home", "Coffee", "Fitness", "Gaming", "Pets", "Travel", "Finance", "Outdoors", "Sports"];

// Brand finder: who is spending on creators right now, who's ramping up, and who keeps coming back to the same
// creators. Filed by what the brand sells (category) and the creator verticals it books.
export default async function Brands({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; sort?: string; view?: string; scope?: string; books?: string }> }) {
  const { q, cat, sort, view, scope, books } = await searchParams;
  const admin = supabaseAdmin();
  const { profile: user, insider, admin: seesAll } = await currentAccess();
  // Admins see the whole index (or just their own with ?scope=mine); everyone else only brands from creators they scanned.
  const mineOnly = !seesAll || scope === "mine";
  const myCreatorIds = user && mineOnly ? await unlockedCreatorIds(user.id) : null;
  let myBrandIds: string[] | null = null;
  if (myCreatorIds) {
    const { data: pr } = myCreatorIds.length ? await admin.from("partnerships").select("brand_id").in("creator_id", myCreatorIds).neq("status", "rejected") : { data: [] };
    myBrandIds = [...new Set((pr || []).map((r) => r.brand_id))];
  }
  const NONE = ["00000000-0000-0000-0000-000000000000"];
  const PREVIEW = 10;  // signed-out visitors see the top rows, the rest is frosted

  const href = (p: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, cat, sort, view, scope, books, ...p })) if (v) sp.set(k, v);
    const s = sp.toString();
    return "/brands" + (s ? "?" + s : "");
  };

  // category counts for the filter row, same scope as the table (counted in SQL: the API caps rows at 1000)
  const { data: catRows } = await admin.rpc("brand_category_counts", { p_ids: myBrandIds ? (myBrandIds.length ? myBrandIds : NONE) : null });
  const counts = new Map<string, number>((catRows || []).map((r: any) => [r.category as string, Number(r.n)]));
  const cats = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const rebookingView = insider && view === "rebooking";
  let query = admin.from("brand_leaderboard_v")
    .select("id,name,category,verticals,deal_count,creator_count,last_seen,is_mass_sponsor,is_affiliate,classified_at,domain,website,site_status,platform_counts,bookings,bookings_90d,bookings_prev_90d,paid_creators,rebook_creators,rebook_rate,median_followers,last_booked_at,pace_delta")
    .limit(200);
  if (q) query = query.ilike("name", `%${q}%`);
  if (cat) query = query.eq("category", cat);
  if (books) query = query.contains("books", [books]);
  if (myBrandIds) query = query.in("id", myBrandIds.length ? myBrandIds : NONE);
  query = sort === "recent" ? query.order("last_booked_at", { ascending: false, nullsFirst: false })
    : sort === "rising" ? query.gt("bookings_90d", 0).order("pace_delta", { ascending: false }).order("bookings_90d", { ascending: false })
    : sort === "rebooks" ? query.order("rebook_creators", { ascending: false }).order("bookings_90d", { ascending: false })
    : sort === "creators" ? query.order("paid_creators", { ascending: false }).order("creator_count", { ascending: false })
    : query.order("bookings_90d", { ascending: false }).order("paid_creators", { ascending: false });
  const { data } = rebookingView ? { data: [] as any[] } : await query;

  // Map view (house): per-brand signals from every deal.
  let mapBrands: MapBrand[] = [];
  if (seesAll && view === "map") {
    const ids = (data || []).map((b) => b.id);
    const { data: rows } = ids.length ? await admin.from("partnerships").select("brand_id,platform,published_at,creator_id,creators(followers)").in("brand_id", ids).neq("status", "rejected").not("published_at", "is", null).limit(5000) : { data: [] };
    const by = new Map<string, any[]>();
    for (const r of rows || []) { const a = by.get(r.brand_id) || []; a.push(r); by.set(r.brand_id, a); }
    mapBrands = (data || []).map((b) => {
      const rs = by.get(b.id) || [];
      const fl = rs.map((r: any) => r.creators?.followers).filter((n: any) => n > 0).sort((a: number, c: number) => a - c);
      const perCreator = new Map<string, number[]>();
      for (const r of rs) { const a = perCreator.get(r.creator_id) || []; a.push(new Date(r.published_at).getTime()); perCreator.set(r.creator_id, a); }
      const repeat = [...perCreator.values()].filter((ts) => ts.length >= 2 && Math.max(...ts) - Math.min(...ts) >= 30 * 864e5).length;
      const times = rs.map((r: any) => new Date(r.published_at).getTime());
      return {
        id: b.id, name: b.name, domain: b.domain, category: b.category, deals: rs.length, creators: perCreator.size,
        last_seen: times.length ? new Date(Math.max(...times)).toISOString() : null, first_seen: times.length ? new Date(Math.min(...times)).toISOString() : null,
        median_followers: fl.length ? fl[Math.floor(fl.length / 2)] : null, repeat_creators: repeat,
        yt: rs.filter((r: any) => r.platform === "youtube").length, ig: rs.filter((r: any) => r.platform === "instagram").length,
        verticals: b.verticals, is_mass: !!b.is_mass_sponsor, is_affiliate: !!b.is_affiliate,
      };
    });
  }

  // Rebooking now (house): creators whose second-or-later booking with a brand landed in the last 60 days.
  let rebooks: any[] = [];
  if (rebookingView) {
    const { data: rn } = await admin.rpc("rebooking_now", { p_days: 60, p_limit: 120, p_category: cat || null });
    const scoped = ((rn || []) as any[]).filter((r) => !myCreatorIds || myCreatorIds.includes(r.creator_id));
    const [{ data: cs }, { data: bs }] = await Promise.all([
      scoped.length ? admin.from("creators").select("id,handle,display_name,platform,followers,avatar_url,category").in("id", [...new Set(scoped.map((r) => r.creator_id))]) : { data: [] },
      scoped.length ? admin.from("brands").select("id,name,category").in("id", [...new Set(scoped.map((r) => r.brand_id))]) : { data: [] },
    ]);
    const cm = new Map((cs || []).map((c: any) => [c.id, c])), bm = new Map((bs || []).map((b: any) => [b.id, b]));
    rebooks = scoped.map((r) => ({ ...r, creator: cm.get(r.creator_id), brand: bm.get(r.brand_id) })).filter((r) => r.creator && r.brand && (!q || r.brand.name.toLowerCase().includes(q.toLowerCase())));
  }

  const tabCls = (on: boolean) => `rounded-md px-3 py-1.5 transition ${on ? "bg-fg text-white shadow-card" : "text-muted hover:text-fg"}`;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="label mb-1.5">Find brand partners</div>
          <h1 className="h2">Brands</h1>
          <p className="mt-1 text-[14px] text-muted">{insider ? "Who is paying creators right now, who's ramping up, and who keeps rebooking the same people. A booking is a separate run of sponsored posts by one creator." : "Brands seen sponsoring creators across the index. Scan a creator to see their deals and contacts."}</p>
        </div>
        <form className="flex w-full gap-2 sm:w-auto">
          {cat && <input type="hidden" name="cat" value={cat} />}
          {sort && <input type="hidden" name="sort" value={sort} />}
          <BrandSearch placeholder="Search brands" />
        </form>
      </div>

      {insider && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center rounded-lg bg-surface2 p-1 text-[13.5px] font-semibold tracking-tight">
            <Link href={href({ view: undefined })} className={tabCls(!view)}>Leaderboard</Link>
            <Link href={href({ view: "rebooking", sort: undefined })} className={tabCls(view === "rebooking")}>Rebooking now</Link>
            {seesAll && <Link href={href({ view: "map" })} className={tabCls(view === "map")}>Map</Link>}
          </div>
          {seesAll && <div className="flex items-center rounded-lg bg-surface2 p-1 text-[13px] font-medium">
            {([["", "Whole index"], ["mine", "My prints"]] as const).map(([v, l]) => <Link key={l} href={href({ scope: v || undefined })} className={tabCls((scope || "") === v)}>{l}</Link>)}
          </div>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="label mr-1">Sells</span>
        <Chip href={href({ cat: undefined })} active={!cat}>All</Chip>
        {cats.slice(0, 18).map(([c, n]) => <Chip key={c} href={href({ cat: c })} active={cat === c}>{c} <span className="num text-dim">{n}</span></Chip>)}
        {cats.length > 18 && <details className="relative"><summary className="cursor-pointer list-none rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:text-fg">+{cats.length - 18} more</summary><div className="absolute z-20 mt-1 flex w-72 flex-wrap gap-1.5 rounded-lg border border-line bg-surface p-2 shadow-pop">{cats.slice(18).map(([c, n]) => <Chip key={c} href={href({ cat: c })} active={cat === c}>{c} <span className="num text-dim">{n}</span></Chip>)}</div></details>}
      </div>
      {!rebookingView && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="label mr-1">Books</span>
          <Chip href={href({ books: undefined })} active={!books}>Any creator</Chip>
          {BOOKS.map((v) => <Chip key={v} href={href({ books: v })} active={books === v}>{v}</Chip>)}
        </div>
      )}

      {insider && !rebookingView && view !== "map" && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="label mr-1">Sort</span>
          {SORTS.map(([s, l, t]) => <Link key={l} href={href({ sort: s || undefined })} title={t} className={`rounded-md border px-2.5 py-1 transition ${(sort || "") === s ? "border-accent bg-accentSoft font-medium text-accent" : "border-line bg-surface text-muted hover:text-fg"}`}>{l}</Link>)}
        </div>
      )}

      {seesAll && view === "map" && <BrandMap brands={mapBrands} />}

      {rebookingView ? (
        <div className="card mt-4 overflow-hidden">
          <div className="px-5 pb-3 pt-5"><h2 className="text-[17px] font-semibold tracking-tight">Creators brands just booked again</h2><p className="mt-1 text-[13px] text-muted">A brand coming back to the same creator is the clearest sign a partnership worked. These are second-or-later bookings from the last 60 days{cat ? ` in ${cat}` : ""}{myCreatorIds ? ", among creators you've printed" : ""}.</p></div>
          {rebooks.length ? (
            <RebookingTable rows={rebooks} />
          ) : <p className="px-5 pb-6 text-[13px] text-muted">No rebookings in the last 60 days{cat ? ` for ${cat} brands` : ""}{myCreatorIds ? " among the creators you've printed. Print more creators in your space and this fills in." : "."}</p>}
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto" style={seesAll && view === "map" ? { display: "none" } : undefined}>
          <table className="tbl">
            <thead>
              {insider
                ? <InsiderBrandHead />
                : <tr><th>Brand</th><th>Category</th><th title="Creator verticals with 2+ distinct creators booked">Books</th><th>Site</th></tr>}
            </thead>
            <tbody>
              {(data || []).slice(0, user ? undefined : PREVIEW).map((b: any) => insider ? (
                <InsiderBrandRow key={b.id} b={b} />
              ) : (
                <tr key={b.id}>
                  <td className="font-medium">{b.name}</td>
                  <td>{b.category ? <Link href={href({ cat: b.category })} className="pill hover:border-accent hover:text-accent">{b.category}</Link> : null}</td>
                  <td><Verticals v={b.verticals} max={3} min={2} /></td>
                  <td className="num text-[11px] text-dim">{b.website ? <a href={b.website} target="_blank" rel="noreferrer" className="hover:text-accent">{b.website.replace(/^https?:\/\/(www\.)?/, "")} ↗</a> : ""}</td>
                </tr>
              ))}
              {!data?.length && <tr><td colSpan={insider ? 7 : 4} className="py-10 text-center text-sm text-muted">{mineOnly && !(myBrandIds?.length) ? <>No prints yet. <Link href="/" className="text-accent hover:underline">Pull a creator&apos;s print</Link> and the brands they work with show up here.</> : <>Nothing matches. <Link href="/brands" className="text-accent hover:underline">Clear filters</Link></>}</td></tr>}
            </tbody>
          </table>
          {!user && (data?.length || 0) > PREVIEW && (
            <div className="relative">
              <div className="pointer-events-none select-none blur-[3px]" aria-hidden>
                <table className="tbl"><tbody>{data!.slice(PREVIEW, PREVIEW + 4).map((b: any) => <tr key={b.id}><td className="font-medium">{b.name}</td><td>{b.category && <span className="pill">{b.category}</span>}</td><td><Verticals v={b.verticals} max={3} min={2} /></td><td /></tr>)}</tbody></table>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-transparent via-surface/80 to-surface">
                <div className="text-sm font-medium">{data!.length - PREVIEW} more brands. Scan a creator to see their deals and contacts.</div>
                <Link href="/login?next=/brands" className="btn-primary">Sign in with Google to see everything</Link>
                <div className="font-mono text-[11px] text-dim">Free while in beta · drafts only, never sends</div>
              </div>
            </div>
          )}
        </div>
      )}
      {insider && !rebookingView && view !== "map" && <p className="mt-3 text-[12px] text-dim">Counts come from creators in the index, so they show direction rather than a brand's full budget. Showing up to 200 brands; filter or search to narrow.</p>}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] transition ${active ? "border-fg bg-fg text-white" : "border-line bg-surface text-muted hover:border-line2 hover:text-fg"}`}>{children}</Link>;
}
