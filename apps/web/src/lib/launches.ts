import { supabaseAdmin } from "@/lib/supabase";

export type Launch = { id: string; brand_id: string; brand: string; website: string | null; kind: string; product: string | null; summary: string | null; posted_at: string; url: string; spoken: string | null; on_video: string | null; window_start: string | null; window_end: string | null; repush_month: string | null; lane_creators: number; contacts: number; status: "open" | "soon" | "repush" | "past"; tracker?: import("@/lib/tracker").TrackerStatus | null };

export function windowStatus(l: { window_start: string | null; window_end: string | null; repush_month: string | null }): Launch["status"] {
  const today = new Date().toISOString().slice(0, 10);
  if (l.window_start && l.window_end && today >= l.window_start && today <= l.window_end) return "open";
  if (l.window_start && today < l.window_start) return "soon";
  if (l.repush_month && today.slice(0, 7) === l.repush_month.slice(0, 7)) return "repush";
  return "past";
}

/** Launch signals from brands paying creators in a lane (category), newest first, with status + proof counts. */
export async function laneLaunches(category: string | null, excludeBrandIds: Set<string> = new Set(), days = 75): Promise<Launch[]> {
  if (!category) return [];
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data: lane } = await admin.from("brand_wall").select("brand_id,creator_id,creators!inner(category)").eq("creators.category", category).eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false).limit(5000);
  const count = new Map<string, Set<string>>();
  for (const r of (lane || []) as any[]) (count.get(r.brand_id) || count.set(r.brand_id, new Set()).get(r.brand_id)!).add(r.creator_id);
  const ids = [...count.keys()].filter((id) => !excludeBrandIds.has(id));
  if (!ids.length) return [];
  const { data: sigs } = await admin.from("launch_signals").select("id,brand_id,kind,product,summary,posted_at,url,spoken,on_video,window_start,window_end,repush_month,brands(name,website)").in("brand_id", ids).gte("posted_at", since).order("posted_at", { ascending: false }).limit(60);
  if (!sigs?.length) return [];
  const { data: cc } = await admin.from("contacts").select("brand_id").in("brand_id", [...new Set(sigs.map((s) => s.brand_id))]).eq("house_only", false);
  const contacts = new Map<string, number>(); for (const c of cc || []) contacts.set(c.brand_id, (contacts.get(c.brand_id) || 0) + 1);
  return (sigs as any[]).map((s) => ({ id: s.id, brand_id: s.brand_id, brand: s.brands?.name || "", website: s.brands?.website || null, kind: s.kind, product: s.product, summary: s.summary, posted_at: s.posted_at, url: s.url, spoken: s.spoken, on_video: s.on_video, window_start: s.window_start, window_end: s.window_end, repush_month: s.repush_month, lane_creators: count.get(s.brand_id)?.size || 0, contacts: contacts.get(s.brand_id) || 0, status: windowStatus(s) }))
    .sort((a, b) => ({ open: 0, soon: 1, repush: 2, past: 3 }[a.status] - { open: 0, soon: 1, repush: 2, past: 3 }[b.status]) || b.lane_creators - a.lane_creators);
}

/** All launch signals, newest first (for the Signals page). */
export async function laneLaunchesAll(days = 45, limit = 40): Promise<Launch[]> {
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data: sigs } = await admin.from("launch_signals").select("id,brand_id,kind,product,summary,posted_at,url,spoken,on_video,window_start,window_end,repush_month,brands(name,website,creator_count)").gte("posted_at", since).order("posted_at", { ascending: false }).limit(limit);
  return ((sigs || []) as any[]).map((s) => ({ id: s.id, brand_id: s.brand_id, brand: s.brands?.name || "", website: s.brands?.website || null, kind: s.kind, product: s.product, summary: s.summary, posted_at: s.posted_at, url: s.url, spoken: s.spoken, on_video: s.on_video, window_start: s.window_start, window_end: s.window_end, repush_month: s.repush_month, lane_creators: s.brands?.creator_count || 0, contacts: 0, status: windowStatus(s) }));
}
