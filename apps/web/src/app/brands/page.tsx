import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Brand leaderboard: who is spending across every creator anyone has scanned.
export default async function Brands({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const admin = supabaseAdmin();
  let query = admin.from("brands").select("id,name,deal_count,creator_count,last_seen,is_mass_sponsor,domain,website,site_status").eq("is_junk", false).neq("site_status", "dead").order("creator_count", { ascending: false }).order("deal_count", { ascending: false }).limit(200);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data } = await query;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="label mb-1.5">Leaderboard</div><h1 className="h2">Brands</h1><p className="mt-1 text-sm text-muted">Who is booking creators across everything indexed. Sorted by creators booked.</p></div>
        <form><input name="q" defaultValue={q || ""} placeholder="Search brands" className="input !w-64" /></form>
      </div>
      <div className="card mt-6 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Brand</th><th>Creators booked</th><th>Deals</th><th>Last seen</th><th>Site</th></tr>
          </thead>
          <tbody>
            {(data || []).map((b) => (
              <tr key={b.id}>
                <td className="font-medium"><Link href={`/brands/${b.id}`} className="hover:text-accent">{b.name}</Link>{b.is_mass_sponsor && <span className="pill ml-2">mass</span>}</td>
                <td className="num">{b.creator_count}</td>
                <td className="num">{b.deal_count}</td>
                <td className="num text-[11px] text-muted">{b.last_seen || ""}</td>
                <td className="num text-[11px] text-dim">{b.website ? <a href={b.website} target="_blank" rel="noreferrer" className="hover:text-accent">{b.website.replace(/^https?:\/\/(www\.)?/, "")} ↗</a> : b.site_status === "unknown" ? "checking…" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
