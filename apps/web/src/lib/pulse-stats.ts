import { supabaseAdmin } from "@/lib/supabase";
import type { PulseStats } from "@/lib/pulse-html";
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
/** The stat row for a creator's pulse: live projects, brands pitched this week, payouts pending, paid this month. */
export async function pulseStats(rosterCreatorId: string, userId: string): Promise<PulseStats> {
  const admin = supabaseAdmin();
  const [{ data: r }, { data: projects }] = await Promise.all([
    admin.from("roster_creators").select("name").eq("id", rosterCreatorId).single(),
    admin.from("projects").select("status,fee,paid_at").eq("roster_creator_id", rosterCreatorId).eq("visible", true),
  ]);
  const first = String(r?.name || "").split(" ")[0];
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const { data: pitched } = first ? await admin.from("tracker_rows").select("brand").eq("user_id", userId).eq("tab", "outreach").gte("date_sent", since).ilike("creator", `%${first}%`) : { data: [] };
  const live = (projects || []).filter((p) => !["paid", "cancelled"].includes(p.status)).length;
  const pending = (projects || []).filter((p) => ["delivered", "invoiced"].includes(p.status)).reduce((s, p) => s + Number(p.fee || 0), 0);
  const month = new Date().toISOString().slice(0, 7);
  const paid = (projects || []).filter((p) => p.status === "paid" && String(p.paid_at || "").startsWith(month)).reduce((s, p) => s + Number(p.fee || 0), 0);
  return { projects: live, pitched: new Set((pitched || []).map((p) => p.brand.toLowerCase())).size, pending: pending ? money(pending) : null, paid: paid ? money(paid) : null };
}
