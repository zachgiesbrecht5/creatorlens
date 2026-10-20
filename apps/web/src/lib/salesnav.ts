import type { NextRequest } from "next/server";
import { companyKey } from "@creatorlens/engine";
import { profileFromKey } from "@/lib/api-key";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

/** Sales Nav is admin-only. Accepts the extension's sp_ key or a signed-in admin session. */
export async function salesNavAdmin(req: NextRequest) {
  const byKey = await profileFromKey(req);
  const profile = byKey || (await currentProfile().catch(() => null));
  if (!profile) return { profile: null, error: "Missing or invalid Sponsorprint key", status: 401 } as const;
  if (profile.plan !== "admin") return { profile: null, error: "Sales Nav sync is for Sponsorprint admins only", status: 403 } as const;
  return { profile, error: null, status: 200 } as const;
}

export const domainOf = (w: string | null | undefined) => (w ? String(w).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase() || null : null);

/** Brands in the Sponsorprint index matching these company names, keyed by companyKey. */
export async function brandsByCompany(names: string[]) {
  const keys = [...new Set(names.map(companyKey).filter((k) => k.length >= 3))];
  const out = new Map<string, { id: string; name: string; domain: string | null; deal_count: number }>();
  if (!keys.length) return out;
  // brands.key strips fewer words than companyKey, so match on both the raw alnum key and ours
  const raw = [...new Set(names.map((n) => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "")).filter((k) => k.length >= 3))];
  const { data } = await supabaseAdmin().from("brands").select("id,name,key,domain,website,deal_count,is_junk").in("key", [...new Set([...keys, ...raw])]);
  for (const b of data || []) {
    if ((b as any).is_junk) continue;
    const k = companyKey(b.name);
    const cur = out.get(k);
    const row = { id: b.id, name: b.name, domain: domainOf(b.website) || domainOf(b.domain), deal_count: b.deal_count || 0 };
    if (!cur || row.deal_count > cur.deal_count) out.set(k, row);
    const kk = String(b.key);
    if (!out.has(kk)) out.set(kk, row);
  }
  return out;
}

/** Look a company name up in a brandsByCompany() map. */
export function brandFor(map: Awaited<ReturnType<typeof brandsByCompany>>, name: string | null | undefined) {
  if (!name) return null;
  return map.get(companyKey(name)) || map.get(String(name).toLowerCase().replace(/[^a-z0-9]/g, "")) || null;
}
