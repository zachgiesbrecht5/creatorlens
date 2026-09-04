// Scan worker. Polls scan_jobs, runs the engine, writes to the shared pool.
// Run one instance (Railway/Fly/Render background service, or `npm run dev:worker`).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, YT_API_KEY, YT_DAILY_BUDGET (default 9000)

import { createClient } from "@supabase/supabase-js";
import {
  scanYouTube, scanInstagram, addLearnedAliases, isLearnable, IgRateLimitError,
  type ScanResult, type PartnershipRow,
} from "@creatorlens/engine";

const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (v === undefined || v === "" || v === "PASTE_ME") throw new Error(`Env ${k} is missing or still a placeholder`);
  return v;
};
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const YT_API_KEY = env("YT_API_KEY");
const YT_DAILY_BUDGET = Number(env("YT_DAILY_BUDGET", "9000"));
const POLL_MS = 3000;

const brandKey = (name: string) => name.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

// ── Token pool for Instagram ───────────────────────────────────
async function pickIgToken() {
  const { data } = await sb.from("ig_connections").select("*")
    .eq("healthy", true).or(`cooldown_until.is.null,cooldown_until.lt.${new Date().toISOString()}`)
    .order("calls_this_hour", { ascending: true }).limit(1);
  const t = data?.[0];
  if (!t) return null;
  const bucket = new Date(); bucket.setMinutes(0, 0, 0);
  const sameHour = t.hour_bucket && new Date(t.hour_bucket).getTime() === bucket.getTime();
  await sb.from("ig_connections").update({ hour_bucket: bucket.toISOString(), calls_this_hour: (sameHour ? t.calls_this_hour : 0) + 2 }).eq("id", t.id);
  return { id: t.id as string, igUserId: t.ig_user_id as string, accessToken: t.access_token as string };
}

async function coolDownToken(id: string, err: string) {
  const until = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  await sb.from("ig_connections").update({ cooldown_until: until, last_error: err.substring(0, 300) }).eq("id", id);
}

// ── House YouTube quota ────────────────────────────────────────
async function ytBudgetLeft(): Promise<number> {
  const day = new Date().toISOString().substring(0, 10);
  const { data } = await sb.from("house_quota").select("yt_units").eq("day", day).maybeSingle();
  return YT_DAILY_BUDGET - (data?.yt_units ?? 0);
}
async function ytBudgetSpend(units: number) {
  const day = new Date().toISOString().substring(0, 10);
  const { data } = await sb.from("house_quota").select("yt_units").eq("day", day).maybeSingle();
  await sb.from("house_quota").upsert({ day, yt_units: (data?.yt_units ?? 0) + units });
}

// ── Learned aliases ────────────────────────────────────────────
let aliasesLoadedAt = 0;
async function ensureLearnedAliases() {
  if (Date.now() - aliasesLoadedAt < 10 * 60 * 1000) return;
  aliasesLoadedAt = Date.now();
  const { data } = await sb.from("learned_aliases").select("key,name").eq("approved", true);
  if (data?.length) addLearnedAliases(Object.fromEntries(data.map((r) => [r.key, r.name])));
}

// ── Persist a scan ─────────────────────────────────────────────
async function persist(job: any, result: ScanResult) {
  const c = result.creator;
  const { data: creator, error: ce } = await sb.from("creators").upsert({
    platform: result.platform, external_id: c.externalId, handle: c.handle, display_name: c.displayName,
    followers: c.followers, avatar_url: c.avatar, bio: c.bio, last_scanned_at: new Date().toISOString(),
  }, { onConflict: "platform,external_id" }).select("id,scan_count,first_scanned_by").single();
  if (ce || !creator) throw new Error("creator upsert failed: " + ce?.message);
  await sb.from("creators").update({ scan_count: (creator.scan_count ?? 0) + 1, first_scanned_by: creator.first_scanned_by ?? job.user_id }).eq("id", creator.id);

  // brands
  const names = new Map<string, PartnershipRow>();
  for (const r of result.rows) if (!names.has(brandKey(r.brand))) names.set(brandKey(r.brand), r);
  const brandIds = new Map<string, string>();
  for (const [key, r] of names) {
    if (!key) continue;
    const { data: b } = await sb.from("brands").upsert({ key, name: r.brand, is_mass_sponsor: r.isMassSponsor }, { onConflict: "key", ignoreDuplicates: false }).select("id").single();
    if (b) brandIds.set(key, b.id);
  }

  // partnerships (upsert on creator+brand+content so rescans refresh rather than duplicate)
  const rows = result.rows.map((r) => ({
    creator_id: creator.id, brand_id: brandIds.get(brandKey(r.brand)), platform: r.platform,
    content_id: r.contentId, content_title: r.contentTitle, content_url: r.contentUrl,
    published_at: r.publishedAt || null, views: r.views, thumbnail: r.thumbnail,
    confidence_score: r.confidenceScore, confidence_label: r.confidenceLabel,
    signal_type: r.signalType, evidence: r.evidence, scanned_at: new Date().toISOString(),
  })).filter((r) => r.brand_id);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("partnerships").upsert(rows.slice(i, i + 500), { onConflict: "creator_id,brand_id,content_id" });
    if (error) throw new Error("partnership upsert failed: " + error.message);
  }

  // brand rollups + alias learning
  for (const id of new Set(brandIds.values())) {
    const { data: agg } = await sb.from("partnerships").select("creator_id,published_at,confidence_label").eq("brand_id", id).neq("status", "rejected");
    const deals = agg?.length ?? 0;
    const creators = new Set(agg?.map((a) => a.creator_id)).size;
    const last = agg?.map((a) => a.published_at).filter(Boolean).sort().pop();
    await sb.from("brands").update({ deal_count: deals, creator_count: creators, last_seen: last ? String(last).substring(0, 10) : null }).eq("id", id);
    const strong = agg?.filter((a) => a.confidence_label === "High").length ?? 0;
    const { data: b } = await sb.from("brands").select("name,key").eq("id", id).single();
    if (b && isLearnable(b.name, strong)) await sb.from("learned_aliases").upsert({ key: b.key, name: b.name, deal_count: strong }, { onConflict: "key" });
  }
  return creator.id;
}

// ── Job loop ───────────────────────────────────────────────────
async function runJob(job: any) {
  await sb.from("scan_jobs").update({ status: "running", started_at: new Date().toISOString(), attempts: job.attempts + 1 }).eq("id", job.id);
  await ensureLearnedAliases();
  let result: ScanResult;
  if (job.platform === "youtube") {
    if ((await ytBudgetLeft()) < 200) throw Object.assign(new Error("House YouTube quota nearly exhausted for today"), { retry: 60 });
    result = await scanYouTube(YT_API_KEY, job.handle);
    await ytBudgetSpend(result.quotaUnits);
  } else if (job.platform === "instagram") {
    const tok = await pickIgToken();
    if (!tok) throw Object.assign(new Error("No healthy Instagram token available (all cooling down)"), { retry: 30 });
    try {
      result = await scanInstagram(tok, job.handle);
    } catch (e: any) {
      if (e instanceof IgRateLimitError) { await coolDownToken(tok.id, e.message); throw Object.assign(e, { retry: 15 }); }
      throw e;
    }
  } else {
    throw new Error("TikTok has no commercial API; log TikTok deals manually.");
  }
  const creatorId = await persist(job, result);
  await sb.from("scan_jobs").update({
    status: "done", creator_id: creatorId, finished_at: new Date().toISOString(),
    items_checked: result.itemsChecked, rows_found: result.rows.length, quota_units: result.quotaUnits,
  }).eq("id", job.id);
  log(`done ${job.platform}/@${job.handle}: ${result.itemsChecked} items, ${result.rows.length} rows, ${result.quotaUnits} units`);
}

async function tick() {
  const { data: jobs, error: pollErr } = await sb.from("scan_jobs").select("*")
    .in("status", ["queued", "rate_limited"]).lte("run_after", new Date().toISOString())
    .order("priority").order("created_at").limit(1);
  if (pollErr) { log("poll failed:", pollErr.message, "(check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"); return; }
  const job = jobs?.[0];
  if (!job) return;
  try {
    await runJob(job);
  } catch (e: any) {
    const retryMin = e?.retry as number | undefined;
    if (retryMin && job.attempts < 6) {
      await sb.from("scan_jobs").update({ status: "rate_limited", error: e.message, run_after: new Date(Date.now() + retryMin * 60000).toISOString() }).eq("id", job.id);
      log(`deferred ${job.handle}: ${e.message}`);
    } else {
      await sb.from("scan_jobs").update({ status: "failed", error: String(e?.message || e).substring(0, 500), finished_at: new Date().toISOString() }).eq("id", job.id);
      // refund the credit on hard failure
      if (job.user_id) await sb.rpc("grant_credits", { p_user: job.user_id, p_kind: "scan", p_n: 1, p_reason: "refund:" + job.id });
      log(`failed ${job.handle}: ${e?.message}`);
    }
  }
}

log("worker up; polling every", POLL_MS, "ms");
(async function loop() {
  for (;;) {
    try { await tick(); } catch (e) { log("tick error", e); }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
})();
