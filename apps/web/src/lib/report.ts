import { supabaseAdmin } from "@/lib/supabase";

// "Most active sponsors by vertical": for a calendar month, the brands with the
// most disclosed creator deals, per creator category, plus new entrants and
// the busiest verticals. Computed live from the index.
export async function monthlyReport(month: string) {   // "2026-08"
  const admin = supabaseAdmin();
  const start = `${month}-01`; const d = new Date(start + "T00:00:00Z"); const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const prevStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const { data: rows } = await admin.from("partnerships").select("brand_id,creator_id,published_at,brands!inner(name,category,is_junk,is_self_brand,is_mass_sponsor),creators!inner(category,handle,display_name,platform)").gte("published_at", start).lt("published_at", end).neq("status", "rejected").limit(5000);
  const ok = (rows || []).filter((r: any) => r.brands && !r.brands.is_junk && !r.brands.is_self_brand && !r.brands.is_mass_sponsor);
  const byVertical = new Map<string, Map<string, { brand: string; brand_id: string; deals: number; creators: Set<string> }>>();
  const brandTotals = new Map<string, { brand: string; brand_id: string; category: string | null; deals: number; creators: Set<string> }>();
  for (const r of ok as any[]) {
    const v = r.creators?.category || "Other";
    const m = byVertical.get(v) || byVertical.set(v, new Map()).get(v)!;
    const e = m.get(r.brand_id) || m.set(r.brand_id, { brand: r.brands.name, brand_id: r.brand_id, deals: 0, creators: new Set() }).get(r.brand_id)!;
    e.deals++; e.creators.add(r.creator_id);
    const t = brandTotals.get(r.brand_id) || brandTotals.set(r.brand_id, { brand: r.brands.name, brand_id: r.brand_id, category: r.brands.category, deals: 0, creators: new Set() }).get(r.brand_id)!;
    t.deals++; t.creators.add(r.creator_id);
  }
  // new entrants: brands with deals this month and none before
  const ids = [...brandTotals.keys()];
  const { data: earlier } = ids.length ? await admin.from("partnerships").select("brand_id").in("brand_id", ids).lt("published_at", start).neq("status", "rejected").limit(5000) : { data: [] };
  const seenBefore = new Set((earlier || []).map((e) => e.brand_id));
  const newcomers = [...brandTotals.values()].filter((b) => !seenBefore.has(b.brand_id)).sort((a, b) => b.deals - a.deals).slice(0, 12);
  const verticals = [...byVertical.entries()].map(([v, m]) => ({ vertical: v, deals: [...m.values()].reduce((s, x) => s + x.deals, 0), top: [...m.values()].sort((a, b) => b.creators.size - a.creators.size || b.deals - a.deals).slice(0, 5).map((x) => ({ ...x, creators: x.creators.size })) })).sort((a, b) => b.deals - a.deals);
  const top = [...brandTotals.values()].sort((a, b) => b.creators.size - a.creators.size || b.deals - a.deals).slice(0, 15).map((x) => ({ ...x, creators: x.creators.size }));
  const { count: prevDeals } = await admin.from("partnerships").select("*", { count: "exact", head: true }).gte("published_at", prevStart).lt("published_at", start).neq("status", "rejected");
  const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { month, label, deals: ok.length, prevDeals: prevDeals || 0, brands: brandTotals.size, creators: new Set(ok.map((r: any) => r.creator_id)).size, top, verticals, newcomers: newcomers.map((x) => ({ ...x, creators: x.creators.size })) };
}
export function lastFullMonth() { const n = new Date(); const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)); return d.toISOString().slice(0, 7); }
