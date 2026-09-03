import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Brand leaderboard: who is spending across every creator anyone has scanned.
export default async function Brands({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const admin = supabaseAdmin();
  let query = admin.from("brands").select("id,name,deal_count,creator_count,last_seen,is_mass_sponsor,domain").order("creator_count", { ascending: false }).order("deal_count", { ascending: false }).limit(200);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data } = await query;
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Brands</h1>
        <form><input name="q" defaultValue={q || ""} placeholder="search brands" className="input !w-64" /></form>
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-2">Brand</th><th className="px-4 py-2">Creators booked</th><th className="px-4 py-2">Deals</th><th className="px-4 py-2">Last seen</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data || []).map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium"><Link href={`/brands/${b.id}`} className="hover:text-brand">{b.name}</Link>{b.is_mass_sponsor && <span className="pill ml-2 bg-slate-100 text-slate-500">mass</span>}</td>
                <td className="px-4 py-2">{b.creator_count}</td>
                <td className="px-4 py-2">{b.deal_count}</td>
                <td className="px-4 py-2 text-slate-500">{b.last_seen || ""}</td>
                <td className="px-4 py-2 text-xs text-slate-400">{b.domain || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
