import { supabaseAdmin } from "@/lib/supabase";

export type TrackerStatus = { state: "clean" | "recent" | "old" | "excluded"; label: string; detail?: string; days?: number; by?: string | null; creator?: string | null; status?: string | null };
const key = (s: string) => String(s || "").toLowerCase().replace(/\b(the|inc|llc|ltd|co|corp|company)\b/g, "").replace(/[^a-z0-9]/g, "");
const dom = (w: string | null | undefined) => (w ? String(w).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase() : null);

/** Tracker status for a set of brands, in one query. Keys are brand ids. */
export async function trackerStatuses(userId: string, brands: { id: string; name: string; website?: string | null }[]): Promise<Record<string, TrackerStatus>> {
  const out: Record<string, TrackerStatus> = {};
  if (!brands.length) return out;
  const admin = supabaseAdmin();
  const keys = [...new Set(brands.map((b) => key(b.name)).filter(Boolean))];
  const domains = [...new Set(brands.map((b) => dom(b.website)).filter(Boolean))] as string[];
  const [{ data: byKey }, { data: byDom }] = await Promise.all([
    keys.length ? admin.from("tracker_rows").select("brand_key,domain,tab,date_sent,sent_by,creator,status").eq("user_id", userId).in("brand_key", keys) : Promise.resolve({ data: [] as any[] }),
    domains.length ? admin.from("tracker_rows").select("brand_key,domain,tab,date_sent,sent_by,creator,status").eq("user_id", userId).in("domain", domains) : Promise.resolve({ data: [] as any[] }),
  ]);
  const rows = [...(byKey || []), ...(byDom || [])];
  const today = Date.now();
  for (const b of brands) {
    const k = key(b.name), d = dom(b.website);
    const mine = rows.filter((r) => r.brand_key === k || (d && r.domain === d));
    if (!mine.length) { out[b.id] = { state: "clean", label: "not contacted" }; continue; }
    if (mine.some((r) => r.tab === "exclude") || mine.some((r) => /replied|inbound|exclude|do not/i.test(String(r.status || "")))) { const r = mine.find((x) => x.tab === "exclude") || mine[0]; out[b.id] = { state: "excluded", label: "do not contact", detail: r.status || "on the exclusion list", by: r.sent_by, creator: r.creator }; continue; }
    const latest = mine.filter((r) => r.date_sent).sort((a, b) => String(b.date_sent).localeCompare(String(a.date_sent)))[0];
    if (!latest) { out[b.id] = { state: "old", label: "in tracker" }; continue; }
    const days = Math.floor((today - new Date(latest.date_sent).getTime()) / 864e5);
    out[b.id] = days <= 90 ? { state: "recent", label: `pitched ${days}d ago`, detail: [latest.sent_by, latest.creator ? `for ${latest.creator}` : null, latest.status].filter(Boolean).join(" · "), days, by: latest.sent_by, creator: latest.creator, status: latest.status } : { state: "old", label: `pitched ${Math.round(days / 30)}mo ago`, detail: [latest.sent_by, latest.creator ? `for ${latest.creator}` : null, latest.status].filter(Boolean).join(" · "), days, by: latest.sent_by, creator: latest.creator, status: latest.status };
  }
  return out;
}
