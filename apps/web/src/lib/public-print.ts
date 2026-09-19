import { supabaseAdmin } from "@/lib/supabase";

// Data for the public, shareable version of a print: brands, months, counts.
// No contacts, no evidence links, no drafts. That's the paid layer.
export async function publicPrint(platform: string, handle: string) {
  const admin = supabaseAdmin();
  const { data: c } = await admin.from("creators").select("id,platform,handle,display_name,avatar_url,followers,category,bio,last_scanned_at").eq("platform", platform).ilike("handle", handle).maybeSingle();
  if (!c || !c.last_scanned_at) return null;
  const { data: wall } = await admin.from("brand_wall").select("brand_id,brand,category,deals,first_seen,last_seen,repeat_partner,confidence").eq("creator_id", c.id).eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false).order("last_seen", { ascending: false });
  const { data: months } = await admin.from("partnerships").select("brand_id,published_at").eq("creator_id", c.id).neq("status", "rejected").not("published_at", "is", null).limit(1000);
  const monthsBy = new Map<string, Set<string>>();
  for (const m of months || []) { (monthsBy.get(m.brand_id) || monthsBy.set(m.brand_id, new Set()).get(m.brand_id)!).add(String(m.published_at).slice(0, 7)); }
  const brands = (wall || []).map((w) => ({ id: w.brand_id, name: w.brand, category: w.category, deals: Number(w.deals) || 1, first: w.first_seen, last: w.last_seen, repeat: !!w.repeat_partner, months: [...(monthsBy.get(w.brand_id) || [])].sort() }));
  const deals = brands.reduce((s, b) => s + b.deals, 0);
  return { creator: c, brands, deals, repeats: brands.filter((b) => b.repeat).length };
}

export const fmtK = (n: number | null | undefined) => (!n ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
export const monthLabel = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "");
