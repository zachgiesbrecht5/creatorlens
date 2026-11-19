// Scout. Around the clock, a little at a time: search YouTube for each lane's phrases, keep
// mid-size channels whose recent video ran far above their own usual views, print the best,
// and file them on /scout with the sponsors found. No model calls: YouTube quota only.
//   one run  = 1 search (100 units) + stats (2) + up to REFINE channels measured (2 each) ≈ 130 units
//   per day  = capped by SCOUT_DAILY_UNITS, and paused whenever the house budget runs low
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchVideoIds, getVideos, channelStats, latestVideoIds, channelMedians, kindOf, isEnglishTitle, dealType, type QuotaMeter, type YtVideo, type YtChannelStats } from "@creatorlens/engine";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[scout]", ...a);
export const SCOUT_DAILY_UNITS = Number(process.env.SCOUT_DAILY_UNITS || 1500);
const MIN_SUBS = Number(process.env.SCOUT_MIN_SUBS || 5000);
const MAX_SUBS = Number(process.env.SCOUT_MAX_SUBS || 300000);
const WINDOW_DAYS = Number(process.env.SCOUT_WINDOW_DAYS || 45);
const REFINE = Number(process.env.SCOUT_REFINE || 12);            // channels measured against their own median per run
const PRINTS_PER_RUN = Number(process.env.SCOUT_PRINTS_PER_RUN || 5);
const MIN_MULT = Number(process.env.SCOUT_MIN_MULT || 2);          // breakout video at least this many times the channel's median
const QUERY_GAP_H = Number(process.env.SCOUT_QUERY_GAP_HOURS || 20);
const HOUSE_FLOOR = Number(process.env.SCOUT_HOUSE_FLOOR || 3000);  // leave this much of the day's YouTube budget for people's own prints

// Not people to represent: outlets, labels, leagues, auto-generated channels.
const NOT_A_CREATOR = /\bnews\b|\bofficial\b|\btv\b|\bnetwork\b|\bmedia\b|\brecords\b|\bvevo\b|\bnba\b|\bnfl\b|\bespn\b|\bfc\b| - topic$|\bclips\b|\bhighlights\b|\bcompilation/i;
const round1 = (n: number) => Math.round(n * 10) / 10;
const clean = (h: string) => String(h || "").replace(/^@/, "");

/** Mid-size channels run by a person, not already known or represented, ranked by views per subscriber. */
export function pickPool<C extends YtChannelStats, V extends { views: number }>(items: { ch: C; v: V }[], skip: Set<string>, repped: Set<string>) {
  return items
    .filter((x) => x.ch && !skip.has(x.ch.id) && x.ch.subs >= MIN_SUBS && x.ch.subs <= MAX_SUBS && x.ch.videoCount >= 10 && !NOT_A_CREATOR.test(x.ch.title) && !repped.has(clean(x.ch.handle).toLowerCase()))
    .map((x) => ({ ...x, perSub: x.v.views / Math.max(1, x.ch.subs) }))
    .filter((x) => x.perSub >= 0.3)
    .sort((a, b) => b.perSub - a.perSub).slice(0, REFINE);
}

/** Worth filing: still uploading, and this video is far above their usual (or bigger than their whole audience). */
export function isBreakout(views: number, perSub: number, median: number | null | undefined, uploads60: number) {
  if (!median || uploads60 < 2) return false;            // no baseline, or gone quiet
  return views / median >= MIN_MULT || perSub >= 1;
}

async function unitsToday(sb: SupabaseClient): Promise<number> {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { data } = await sb.from("scout_runs").select("units").gte("created_at", since.toISOString()).limit(500);
  return (data || []).reduce((s, r: any) => s + (r.units || 0), 0);
}

/** Once a scouted channel's print has landed, count the brands that actually paid or sent product. */
async function fillSponsors(sb: SupabaseClient): Promise<number> {
  const { data: waiting } = await sb.from("scout_candidates").select("id,channel_id,handle").is("printed_at", null).gte("found_at", new Date(Date.now() - 21 * 864e5).toISOString()).limit(60);
  if (!waiting?.length) return 0;
  const { data: creators } = await sb.from("creators").select("id,external_id,last_scanned_at").eq("platform", "youtube").in("external_id", waiting.map((w) => w.channel_id)).not("last_scanned_at", "is", null);
  let n = 0;
  for (const c of creators || []) {
    const w = waiting.find((x) => x.channel_id === c.external_id); if (!w) continue;
    const { data: deals } = await sb.from("partnerships").select("confidence_label,signal_type,evidence,brands!inner(name,is_junk,is_self_brand)").eq("creator_id", c.id).neq("status", "rejected").in("confidence_label", ["High", "Medium"]).eq("brands.is_junk", false).eq("brands.is_self_brand", false).limit(400);
    const paid = new Map<string, number>();   // brand -> 2 sponsored, 1 gifted
    for (const d of (deals || []) as any[]) {
      const t = dealType(d.signal_type, d.evidence, w.handle);
      const rank = t === "Sponsored" ? 2 : t === "Gifted" ? 1 : 0;
      if (rank) paid.set(d.brands.name, Math.max(paid.get(d.brands.name) || 0, rank));
    }
    const names = [...paid.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    await sb.from("scout_candidates").update({ sponsors: names.length, sponsor_names: names.slice(0, 8), printed_at: c.last_scanned_at, updated_at: new Date().toISOString() }).eq("id", w.id);
    n++;
  }
  return n;
}

export async function runScout(sb: SupabaseClient, ytKey: string, ytBudgetLeft: () => Promise<number>, spendYt: (units: number) => Promise<void>): Promise<number> {
  await fillSponsors(sb).catch((e: any) => log("sponsor fill failed", e?.message));
  if (!ytKey) return 0;
  if ((await unitsToday(sb)) + 140 > SCOUT_DAILY_UNITS) return 0;
  if ((await ytBudgetLeft()) < HOUSE_FLOOR) { log("house YouTube budget is low; scouting paused for today"); return 0; }

  const gap = new Date(Date.now() - QUERY_GAP_H * 3600e3).toISOString();
  const { data: q } = await sb.from("scout_queries").select("id,query,lane,runs,found").eq("active", true).or(`last_run_at.is.null,last_run_at.lt.${gap}`).order("last_run_at", { ascending: true, nullsFirst: true }).limit(1).maybeSingle();
  if (!q) return 0;

  const meter: QuotaMeter = { units: 0 };
  let seen = 0, kept = 0; let error: string | null = null;
  try {
    const after = new Date(Date.now() - WINDOW_DAYS * 864e5);
    const ids = await searchVideoIds(ytKey, q.query, { order: "viewCount", publishedAfter: after, max: 50, lang: "en" }, meter);
    const videos = (await getVideos(ytKey, ids, meter)).filter((v) => v.channelId && kindOf(v.durationSeconds, v.title) === "video" && isEnglishTitle(v.title));
    const stats = await channelStats(ytKey, videos.map((v) => v.channelId || ""), meter);
    seen = stats.size;

    // one (best) video per channel, mid-size channels only, nobody we already know or represent
    const best = new Map<string, YtVideo>();
    for (const v of videos) { const cur = best.get(v.channelId!); if (!cur || v.views > cur.views) best.set(v.channelId!, v); }
    const chIds = [...best.keys()];
    const [{ data: known }, { data: roster }] = await Promise.all([
      chIds.length ? sb.from("scout_candidates").select("channel_id").in("channel_id", chIds) : Promise.resolve({ data: [] as any[] }),
      sb.from("roster_creators").select("handle").eq("platform", "youtube"),
    ]);
    const skip = new Set((known || []).map((k: any) => k.channel_id));
    const repped = new Set((roster || []).map((r: any) => clean(r.handle).toLowerCase()).filter(Boolean));
    const pool = pickPool(chIds.map((id) => ({ ch: stats.get(id)!, v: best.get(id)! })), skip, repped);

    // measure each against its own recent uploads: is this video a breakout for them, and are they active?
    const rows: any[] = [];
    for (const x of pool) {
      const recent = await getVideos(ytKey, await latestVideoIds(ytKey, x.ch.uploadsPlaylist, 30, meter), meter);
      const med = channelMedians(recent.filter((r) => r.id !== x.v.id)).median_video;
      const uploads60 = recent.filter((r) => Date.now() - new Date(r.publishedAt).getTime() < 60 * 864e5).length;
      if (!isBreakout(x.v.views, x.perSub, med, uploads60)) continue;
      const mult = x.v.views / med!;
      rows.push({ channel_id: x.ch.id, handle: clean(x.ch.handle) || x.ch.id, title: x.ch.title, subs: x.ch.subs, video_count: x.ch.videoCount, thumbnail: x.ch.thumbnail || null, lane: q.lane, query: q.query, breakout_video_id: x.v.id, breakout_title: x.v.title.slice(0, 200), breakout_views: x.v.views, breakout_published_at: x.v.publishedAt, median_views: Math.round(med!), mult: round1(mult), views_per_sub: round1(x.perSub), uploads_60d: uploads60 });
    }
    rows.sort((a, b) => b.mult - a.mult);
    if (rows.length) {
      const { error: insErr } = await sb.from("scout_candidates").upsert(rows, { onConflict: "channel_id", ignoreDuplicates: true });
      if (insErr) throw new Error(insErr.message);
      kept = rows.length;
      // print the strongest few so the board can say who has sponsors and who doesn't
      let queued = 0;
      for (const r of rows) {
        if (queued >= PRINTS_PER_RUN) break;
        const { data: printed } = await sb.from("creators").select("id,last_scanned_at").eq("platform", "youtube").eq("external_id", r.channel_id).maybeSingle();
        if (printed?.last_scanned_at) continue;
        const { data: live } = await sb.from("scan_jobs").select("id").eq("platform", "youtube").in("handle", [r.handle, r.channel_id]).in("status", ["queued", "running", "rate_limited"]).limit(1);
        if (live?.length) continue;
        await sb.from("scan_jobs").insert({ user_id: null, platform: "youtube", handle: r.handle, priority: 8, source: "scout", note: `Scout: "${q.query}" (${r.mult}x their usual)` });
        queued++;
      }
    }
  } catch (e: any) { error = String(e?.message || e).slice(0, 300); log("run failed", q.query, error); }

  if (meter.units) await spendYt(meter.units).catch(() => {});
  await sb.from("scout_runs").insert({ query_id: q.id, query: q.query, units: meter.units, seen, kept, error });
  await sb.from("scout_queries").update({ last_run_at: new Date().toISOString(), runs: (q.runs || 0) + 1, found: (q.found || 0) + kept }).eq("id", q.id);
  log(`"${q.query}": ${seen} channels seen, ${kept} kept, ${meter.units} units`);
  return kept;
}
