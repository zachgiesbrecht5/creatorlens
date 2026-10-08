import { supabaseAdmin } from "@/lib/supabase";

// Shared reads for the creator portal's tile pages (/me/followers, /me/engagement, /me/pitched).
export const fmtK = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));
export const pct = (now: number | null | undefined, then: number | null | undefined) => (now && then ? ((now - then) / then) * 100 : null);
export const signed = (p: number | null) => (p == null ? null : `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`);
export const dShort = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

export async function myCreator(platform: string, handle: string) {
  const { data } = await supabaseAdmin().from("creators").select("id,handle,platform,display_name,followers,category,performance,last_scanned_at").eq("platform", platform).ilike("handle", String(handle || "").replace(/^@/, "")).maybeSingle();
  return data;
}

/** Follower and median history from the weekly prints, oldest first, within `days`. */
export async function history(creatorId: string, days = 90) {
  const { data } = await supabaseAdmin().from("performance_snapshots").select("captured_at,followers,median,items").eq("creator_id", creatorId).gte("captured_at", new Date(Date.now() - days * 864e5).toISOString()).order("captured_at", { ascending: true }).limit(400);
  return (data || []) as { captured_at: string; followers: number | null; median: number; items: number }[];
}

/** The value at least `days` ago (closest snapshot on or before that point). */
export function at<T extends { captured_at: string }>(rows: T[], days: number): T | undefined {
  const cutoff = Date.now() - days * 864e5;
  return [...rows].reverse().find((r) => new Date(r.captured_at).getTime() <= cutoff);
}

export type PitchRow = { brand: string; date_sent: string | null; status: string | null; stage: "pitched" | "followup" | "conversation" | "declined" };
/** Brands the team has pitched for this creator: name, date and stage only. Never contacts or notes. */
export async function pitchedFor(userId: string, firstName: string, days = 60): Promise<PitchRow[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin().from("tracker_rows").select("brand,date_sent,status").eq("user_id", userId).eq("tab", "outreach").ilike("creator", `%${firstName}%`).gte("date_sent", since).order("date_sent", { ascending: false }).limit(600);
  const stage = (s: string | null): PitchRow["stage"] => {
    const t = String(s || "").toLowerCase();
    if (/interest|repl|negot|call|offer|booked|contract|signed/.test(t)) return "conversation";
    if (/declin|pass|no budget|not a fit|unsubscribe/.test(t)) return "declined";
    if (/follow/.test(t)) return "followup";
    return "pitched";
  };
  // one row per brand: the most advanced stage wins, latest date kept
  const rank = { pitched: 0, followup: 1, declined: 2, conversation: 3 };
  const by = new Map<string, PitchRow>();
  for (const r of data || []) {
    const k = r.brand.trim().toLowerCase(); const st = stage(r.status);
    const cur = by.get(k);
    if (!cur) by.set(k, { brand: r.brand.trim(), date_sent: r.date_sent, status: r.status, stage: st });
    else if (rank[st] > rank[cur.stage]) by.set(k, { ...cur, status: r.status, stage: st });
  }
  return [...by.values()];
}
