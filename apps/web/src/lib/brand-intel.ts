// Reading a brand's booking history as a spend pattern: pace, seasonality, and a cautious forecast.
// Everything here works on bookings (separate runs of paid posts per creator, see migration 0063), counted only
// from creators in the index, so numbers describe the slice we can see, not the brand's whole budget.
import type { SupabaseClient } from "@supabase/supabase-js";

export type BrandStats = {
  brand_id: string;
  bookings: number; bookings_90d: number; bookings_prev_90d: number;
  bookings_12m: number; bookings_prev_12m: number; bookings_next90_last_year: number;
  creators: number; creators_90d: number; rebook_creators: number;
  median_followers: number | null; first_at: string | null; last_at: string | null;
  by_month: number[] | null;
};

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Pace = { key: "rising" | "steady" | "cooling" | "quiet" | "new"; label: string; tone: "ok" | "warn" | "muted" | "accent"; change: number | null };

/** Last 90 days against the 90 before. Small numbers swing hard, so it takes a real gap to call a trend. */
export function pace(now: number, prev: number): Pace {
  if (now === 0 && prev === 0) return { key: "quiet", label: "Quiet", tone: "muted", change: null };
  if (prev === 0) return { key: "new", label: "New activity", tone: "accent", change: null };
  const change = (now - prev) / prev;
  if (now - prev >= 3 && change >= 0.3) return { key: "rising", label: "Rising", tone: "ok", change };
  if (prev - now >= 3 && change <= -0.3) return { key: "cooling", label: "Cooling", tone: "warn", change };
  return { key: "steady", label: "Steady", tone: "muted", change };
}

/** Months that carry clearly more than their share, once there's enough history to say so. */
export function peakMonths(byMonth: number[] | null | undefined, firstAt: string | null): number[] {
  if (!byMonth || byMonth.length !== 12) return [];
  const total = byMonth.reduce((a, b) => a + b, 0);
  const spanDays = firstAt ? (Date.now() - new Date(firstAt).getTime()) / 864e5 : 0;
  if (total < 10 || spanDays < 300) return [];
  const avg = total / 12;
  return byMonth.map((n, i) => ({ n, i })).filter((m) => m.n >= Math.max(3, avg * 1.6)).sort((a, b) => b.n - a.n).slice(0, 3).map((m) => m.i);
}

/** The next calendar month (from this one) that is a peak, with how many months away it is. */
export function nextPeak(peaks: number[]): { month: number; inMonths: number } | null {
  if (!peaks.length) return null;
  const cur = new Date().getMonth();
  let best: { month: number; inMonths: number } | null = null;
  for (const m of peaks) { const d = (m - cur + 12) % 12; if (!best || d < best.inMonths) best = { month: m, inMonths: d }; }
  return best;
}

/** Bookings to expect over the next 90 days: recent pace, nudged by how busy the coming three months usually are.
 *  Returned as a range because the inputs are small counts. Null when there's too little to go on. */
export function forecast90(s: BrandStats): { low: number; high: number; basis: string } | null {
  const recent = (s.bookings_90d + s.bookings_prev_90d) / 2;
  if (s.bookings < 4 || recent < 1) return null;
  let factor = 1, basis = "recent pace";
  const total = (s.by_month || []).reduce((a, b) => a + b, 0);
  const spanDays = s.first_at ? (Date.now() - new Date(s.first_at).getTime()) / 864e5 : 0;
  if (s.by_month && total >= 12 && spanDays >= 300) {
    const cur = new Date().getMonth();
    const next3 = [1, 2, 3].reduce((a, k) => a + s.by_month![(cur + k) % 12], 0);
    const last3 = [0, -1, -2].reduce((a, k) => a + s.by_month![(cur + k + 12) % 12], 0) || 1;
    factor = Math.min(2, Math.max(0.5, next3 / last3));
    basis = "recent pace and their usual seasonality";
  }
  const mid = recent * factor;
  return { low: Math.max(0, Math.floor(mid * 0.7)), high: Math.max(1, Math.ceil(mid * 1.3)), basis };
}

export const sizeBand = (f: number | null | undefined) =>
  !f ? null : f >= 1e6 ? "1M+" : f >= 5e5 ? "500K to 1M" : f >= 1e5 ? "100K to 500K" : f >= 2.5e4 ? "25K to 100K" : "under 25K";

export const shortDate = (s: string | null | undefined, withYear = false) =>
  s ? new Date(s).toLocaleDateString("en-US", withYear ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" }) : "";

export async function brandStats(sb: SupabaseClient, brandId: string): Promise<BrandStats | null> {
  const { data } = await sb.from("brand_stats_mv").select("*").eq("brand_id", brandId).maybeSingle();
  return (data as BrandStats) || null;
}
