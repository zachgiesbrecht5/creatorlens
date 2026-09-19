// Brand print. For a brand: two YouTube searches over disclosures
// ("#XPartner", "sponsored by X"), dedupe the channels behind the matching
// videos, queue their prints (free, source=brandscan, capped), and take an
// Instagram hashtag pulse for #XPartner (post count last 30 days; the API
// doesn't say who posted). Nightly: the ten brands people viewed most this
// week that haven't been scanned in 30 days.
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchVideoChannels, hashtagPulse, type IgToken } from "@creatorlens/engine";
import { alert } from "./observe";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[brandscan]", ...a);
const YT_KEY = process.env.YT_API_KEY || "";
const MAX_PRINTS = Number(process.env.BRANDSCAN_MAX_PRINTS || 12);

export async function runBrandScans(sb: SupabaseClient, limit = 1): Promise<number> {
  const { data: jobs } = await sb.from("brand_scans").select("id,brand_id,requested_by").eq("status", "queued").order("created_at").limit(limit);
  if (!jobs?.length) return 0;
  for (const j of jobs) {
    await sb.from("brand_scans").update({ status: "running" }).eq("id", j.id);
    try { await scanOne(sb, j.id, j.brand_id, j.requested_by); }
    catch (e: any) { log("failed", j.id, e?.message); await alert(sb, "brand scan failed", { id: j.id, error: String(e?.message || e).slice(0, 300) }); await sb.from("brand_scans").update({ status: "failed", error: String(e?.message || e).slice(0, 400), finished_at: new Date().toISOString() }).eq("id", j.id); }
  }
  return jobs.length;
}

async function scanOne(sb: SupabaseClient, id: string, brandId: string, requestedBy: string | null) {
  const { data: brand } = await sb.from("brands").select("id,name,domain").eq("id", brandId).single();
  if (!brand) throw new Error("brand missing");
  const slug = brand.name.replace(/[^A-Za-z0-9]/g, "");
  const found: any[] = [];
  const seen = new Set<string>();
  if (YT_KEY) {
    for (const q of [`#${slug}Partner`, `"sponsored by ${brand.name}"`]) {
      try {
        const chans = await searchVideoChannels(YT_KEY, q, 25);
        for (const c of chans) { if (seen.has(c.channelId)) continue; seen.add(c.channelId); found.push({ platform: "youtube", handle: c.channelId, external_id: c.channelId, title: c.title, video_title: c.videoTitle, video_id: c.videoId, published_at: c.publishedAt, query: q, queued: false }); }
        // budget accounting
        const day = new Date().toISOString().slice(0, 10);
        const { data: hq } = await sb.from("house_quota").select("yt_units").eq("day", day).maybeSingle();
        await sb.from("house_quota").upsert({ day, yt_units: Number(hq?.yt_units || 0) + 100 });
      } catch (e: any) { log("yt query failed", q, e?.message); }
    }
  }
  // queue prints for channels not printed in 30 days, newest first, capped
  let queued = 0;
  for (const f of found.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))) {
    if (queued >= MAX_PRINTS) break;
    const { data: known } = await sb.from("creators").select("id,last_scanned_at").eq("platform", "youtube").eq("external_id", f.external_id).maybeSingle();
    if (known?.last_scanned_at && Date.now() - new Date(known.last_scanned_at).getTime() < 30 * 864e5) { f.queued = "cached"; continue; }
    const { data: existing } = await sb.from("scan_jobs").select("id").eq("platform", "youtube").eq("handle", f.external_id).in("status", ["queued", "running", "rate_limited"]).limit(1);
    if (existing?.length) { f.queued = true; continue; }
    await sb.from("scan_jobs").insert({ user_id: requestedBy, platform: "youtube", handle: f.external_id, priority: 8, source: "brandscan" });
    f.queued = true; queued++;
  }
  if (requestedBy) for (const f of found) await sb.from("creator_access").upsert({ user_id: requestedBy, platform: "youtube", handle: String(f.external_id).toLowerCase() }, { onConflict: "user_id,platform,handle", ignoreDuplicates: true });
  // Instagram pulse
  let pulse: any = null;
  try {
    const { data: tok } = await sb.from("ig_connections").select("ig_user_id,access_token").eq("healthy", true).or("cooldown_until.is.null,cooldown_until.lt.now()").limit(1).maybeSingle();
    if (tok) pulse = await hashtagPulse({ igUserId: tok.ig_user_id, accessToken: tok.access_token } as IgToken, `${slug}Partner`);
  } catch (e: any) { log("ig pulse failed", e?.message); }
  await sb.from("brand_scans").update({ status: "done", found, ig_pulse: pulse, finished_at: new Date().toISOString() }).eq("id", id);
  await sb.from("brands").update({ last_brand_scan_at: new Date().toISOString(), ...(pulse ? { ig_pulse: { ...pulse, checked_at: new Date().toISOString() } } : {}) }).eq("id", brandId);
  log(brand.name, found.length, "channels,", queued, "prints queued, ig pulse", pulse?.posts ?? "n/a");
}

/** Nightly: most-viewed brands this week that haven't had a brand print in 30 days. */
export async function autoBrandScans(sb: SupabaseClient, n = 10) {
  const { data: ev } = await sb.from("events").select("props").eq("name", "brand_view").gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()).limit(2000);
  const counts = new Map<string, number>();
  for (const e of ev || []) { const b = (e.props as any)?.brand_id; if (b) counts.set(b, (counts.get(b) || 0) + 1); }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  let queued = 0;
  for (const brandId of top) {
    if (queued >= n) break;
    const { data: b } = await sb.from("brands").select("last_brand_scan_at,is_junk").eq("id", brandId).maybeSingle();
    if (!b || b.is_junk) continue;
    if (b.last_brand_scan_at && Date.now() - new Date(b.last_brand_scan_at).getTime() < 30 * 864e5) continue;
    await sb.from("brand_scans").insert({ brand_id: brandId, requested_by: null });
    queued++;
  }
  log("auto queued", queued);
  return queued;
}
