import type { SupabaseClient } from "@supabase/supabase-js";

/** Join a brand scan's found rows with the index: print status, avatar, size, confirmed deals.
 *  Works for both platforms (YouTube rows key on channel id, Instagram rows on handle). */
export async function enrichScan(admin: SupabaseClient, scan: { id: string; status: string; found: any; ig_pulse: any; error?: string | null; brand_id: string }) {
  const found = (scan.found || []) as any[];
  const yt = found.filter((f) => (f.platform || "youtube") === "youtube").map((f) => f.external_id).filter(Boolean);
  const ig = found.filter((f) => f.platform === "instagram").map((f) => String(f.handle).toLowerCase()).filter(Boolean);
  const sel = "id,platform,handle,external_id,display_name,avatar_url,followers,last_scanned_at,category";
  const { data: ytC } = yt.length ? await admin.from("creators").select(sel).eq("platform", "youtube").in("external_id", yt) : { data: [] as any[] };
  const { data: igC } = ig.length ? await admin.from("creators").select(sel).eq("platform", "instagram").in("handle", ig) : { data: [] as any[] };
  const keys = [...yt, ...ig];
  const { data: jobs } = keys.length ? await admin.from("scan_jobs").select("platform,handle,status").in("handle", keys).order("created_at", { ascending: false }) : { data: [] as any[] };
  const creators = [...(ytC || []), ...(igC || [])];
  const ids = creators.map((c) => c.id);
  const { data: booked } = ids.length ? await admin.from("brand_wall_mv").select("creator_id,deals").eq("brand_id", scan.brand_id).in("creator_id", ids) : { data: [] as any[] };
  const rows = found.map((f) => {
    const platform = f.platform || "youtube";
    const c = platform === "youtube" ? creators.find((x) => x.platform === "youtube" && x.external_id === f.external_id) : creators.find((x) => x.platform === "instagram" && String(x.handle).toLowerCase() === String(f.handle).toLowerCase());
    const jobKey = platform === "youtube" ? f.external_id : String(f.handle).toLowerCase();
    const job = (jobs || []).find((j) => j.platform === platform && String(j.handle).toLowerCase() === String(jobKey).toLowerCase());
    const deal = (booked || []).find((b) => b.creator_id === c?.id);
    const print_status = c?.last_scanned_at ? "done" : job?.status || (f.queued === "cached" ? "done" : f.queued === "over cap" ? "not printed" : "queued");
    return {
      ...f, platform,
      post_url: f.post_url || (platform === "youtube" && f.video_id ? `https://www.youtube.com/watch?v=${f.video_id}` : null),
      print_status, handle: c?.handle || f.handle || f.external_id, display_name: c?.display_name || f.title,
      avatar_url: c?.avatar_url || f.avatar_url || null, followers: c?.followers ?? f.followers ?? null, category: c?.category || null,
      confirmed_deals: deal ? Number(deal.deals) : 0, new_to_index: !f.known,
    };
  });
  return { id: scan.id, status: scan.status, found: rows, ig_pulse: scan.ig_pulse, error: scan.error || null };
}
