// Scan worker. Polls scan_jobs, runs the engine, writes to the shared pool.
// Run one instance (Railway/Fly/Render background service, or `npm run dev:worker`).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, YT_API_KEY, YT_DAILY_BUDGET (default 9000),
//      ANTHROPIC_API_KEY (optional: creator verticals + brand categories via Claude)

import { createClient } from "@supabase/supabase-js";
import {
  scanYouTube, scanInstagram, addLearnedAliases, isLearnable, IgRateLimitError,
  type ScanResult, type PartnershipRow,
} from "@creatorlens/engine";
import { classifyCreator, classifyBrands, rollupVerticals, classifyBackfill } from "./classify";

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
  // The same brand can be detected twice in one piece of content (e.g. title +
  // description). Postgres rejects duplicate keys within a single upsert, so
  // keep the highest-confidence row per (creator, brand, content).
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const k = `${r.brand_id}|${r.content_id}`;
    const prev = byKey.get(k);
    if (!prev || (r.confidence_score ?? 0) > (prev.confidence_score ?? 0)) byKey.set(k, r);
  }
  const dedup = [...byKey.values()];
  for (let i = 0; i < dedup.length; i += 500) {
    const { error } = await sb.from("partnerships").upsert(dedup.slice(i, i + 500), { onConflict: "creator_id,brand_id,content_id" });
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

  // categories: creator vertical (every scan, so a changed bio re-files them),
  // brand categories for anything new, then the verticals rollup.
  const touched = [...new Set(brandIds.values())];
  try {
    await classifyCreator(sb, creator.id, true);
    // resolve sites for new brands first so the classifier sees the brand's own page (cap per scan; backfill gets the rest)
    const { data: fresh } = await sb.from("brands").select("id,key,name,domain,website,website_locked,name_locked").in("id", touched).is("site_checked_at", null).order("deal_count", { ascending: false }).limit(12);
    for (const b of fresh || []) { try { await resolveBrandSite(b); } catch (e: any) { log("site check failed", b.name, e?.message); } }
    await classifyBrands(sb, touched);
    await rollupVerticals(sb, touched);
  } catch (e: any) { log("classify failed:", e?.message); }
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


// ── Brand website resolution ────────────────────────────────
// A brand that has no reachable website is usually a parsing artefact
// ("Https", "Choice Bank And"). We try, in order: a URL in the evidence text
// that contains the brand key, <key>.com, <firstword>.com. Verified with a
// short GET (some sites reject HEAD). Result drives the link in the UI and
// the "unverified" filter.
const JUNK_NAME_RE = /^(?:https?|www|http|my friends|the team|our friends)$|https?$|^www/i;
const NON_BRAND_HOSTS = new Set(["youtube", "youtu", "instagram", "tiktok", "facebook", "twitter", "x", "bit", "linktr", "amazon", "amzn", "google", "apple", "spotify", "discord", "twitch", "patreon", "shopify", "linkedin", "t", "goo"]);

type SiteInfo = { origin: string; title: string | null; description: string | null };

const decodeEntities = (t: string) => t.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
function readMeta(html: string): { title: string | null; description: string | null } {
  const pick = (re: RegExp) => { const m = html.match(re); return m ? decodeEntities(m[1]).slice(0, 200) : null; };
  const title = pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i)
    || pick(/<title[^>]*>([^<]{1,200})<\/title>/i);
  const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
    || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  return { title, description };
}

async function reachable(host: string): Promise<SiteInfo | null> {
  for (const url of [`https://${host}`, `https://www.${host}`]) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(url, { method: "GET", redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; Sponsorprint/1.0)", accept: "text/html" } });
      clearTimeout(t);
      if (r.status < 400 || r.status === 403 || r.status === 429) {  // 403/429 = bot wall, site exists
        let meta = { title: null as string | null, description: null as string | null };
        if (r.status < 400) { try { meta = readMeta((await r.text()).slice(0, 200_000)); } catch { /* keep nulls */ } }
        // strip checkout./shop./us. style subdomains back to the brand root
        const u = new URL(r.url);
        const parts = u.hostname.replace(/^www\./, "").split(".");
        const root = parts.length > 2 && !/^(co|com|org|net)$/.test(parts[parts.length - 2]) ? parts.slice(-2).join(".") : parts.join(".");
        return { origin: `${u.protocol}//${root === u.hostname.replace(/^www\./, "") ? u.hostname : "www." + root}`, ...meta };
      }
    } catch { /* try next */ }
  }
  return null;
}

// Manual overrides: matched by domain first, then brand key.
async function findOverride(brand: { key: string; domain: string | null; website?: string | null }) {
  const keys = [brand.domain, brand.website ? new URL(brand.website).hostname.replace(/^www\./, "") : null, brand.key].filter(Boolean) as string[];
  const { data } = await sb.from("brand_overrides").select("*").in("match_key", keys.map((k) => k.toLowerCase()));
  if (!data?.length) return null;
  // domain match beats key match
  return data.find((o) => o.match_key !== brand.key) || data[0];
}

async function resolveBrandSite(brand: { id: string; key: string; name: string; domain: string | null; website?: string | null; website_locked?: boolean; name_locked?: boolean }) {
  const ov = await findOverride(brand);
  if (ov) {
    const patch: Record<string, unknown> = { site_checked_at: new Date().toISOString() };
    if (ov.is_junk != null) patch.is_junk = ov.is_junk;
    if (ov.website) { patch.website = ov.website; patch.site_status = "ok"; patch.domain = new URL(ov.website).hostname.replace(/^www\./, ""); patch.website_locked = true; }
    if (ov.display_name) { patch.name = ov.display_name; patch.name_locked = true; }
    if (ov.category) { patch.category = ov.category; patch.category_locked = true; patch.classified_at = new Date().toISOString(); patch.category_confidence = 1; }
    if (ov.website) { const info = await reachable(patch.domain as string); if (info) { patch.site_title = info.title; patch.site_description = info.description; } }
    await sb.from("brands").update(patch).eq("id", brand.id);
    log("override applied", brand.name, "->", ov.display_name || ov.category || ov.website);
    return;
  }
  if (JUNK_NAME_RE.test(brand.key) || JUNK_NAME_RE.test(brand.name)) {
    await sb.from("brands").update({ is_junk: true, site_status: "dead", site_checked_at: new Date().toISOString() }).eq("id", brand.id);
    return;
  }
  const candidates: string[] = [];
  if (brand.website_locked && brand.website) candidates.push(new URL(brand.website).hostname.replace(/^www\./, ""));
  if (brand.domain) candidates.push(brand.domain.toLowerCase());
  const { data: ev } = await sb.from("partnerships").select("evidence").eq("brand_id", brand.id).limit(20);
  const keyStem = brand.key.slice(0, Math.min(6, brand.key.length));
  for (const e of ev || []) {
    const text = String(e.evidence || "");
    // partner-style hashtags and @mentions are the brand's own handle: #stanley1913partner -> stanley1913.com
    for (const m of text.matchAll(/#([a-z0-9_]+?)(?:partner|ambassador|crew|family|team|collab|sponsored)\b/gi)) {
      const stem = m[1].toLowerCase().replace(/_/g, "");
      if (stem.length >= 4 && stem.includes(keyStem) && !NON_BRAND_HOSTS.has(stem)) candidates.push(`${stem}.com`);
    }
    for (const m of text.matchAll(/@([a-z0-9_.]+)/gi)) {
      const stem = m[1].toLowerCase().replace(/[._]/g, "").replace(/(official|usa|us|uk|ca|global|hq|shop|store)$/, "");
      if (stem.length >= 4 && stem.includes(keyStem) && !NON_BRAND_HOSTS.has(stem)) candidates.push(`${stem}.com`);
    }
    // evidence URLs mentioning the brand
    for (const m of text.matchAll(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|co|io|org|net|ca|uk|us|shop|app))\b/gi)) {
      const host = m[1].toLowerCase();
      const root = host.split(".")[0];
      if (NON_BRAND_HOSTS.has(root)) continue;
      if (root.replace(/[^a-z0-9]/g, "").includes(keyStem)) candidates.push(host);
    }
  }
  candidates.push(`${brand.key}.com`);
  const first = brand.name.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ")[0];
  if (first && first.length >= 4 && first !== brand.key) candidates.push(`${first}.com`);

  let info: SiteInfo | null = null;
  for (const host of [...new Set(candidates)].slice(0, 6)) {
    info = await reachable(host);
    if (info) break;
  }
  const patch: Record<string, unknown> = {
    website: info?.origin ?? null, site_status: info ? "ok" : "dead", site_checked_at: new Date().toISOString(),
    site_title: info?.title ?? null, site_description: info?.description ?? null,
    domain: brand.domain || (info ? new URL(info.origin).hostname.replace(/^www\./, "") : null),
  };
  // og:site_name is the brand's own spelling ("Feastables", not "Fstbls")
  if (info?.title && !brand.name_locked && info.title.length <= 40 && !/[|:\-–—]/.test(info.title)) {
    const t = info.title.replace(/\s*[»«|·].*$/, "").replace(/\s*(Limited|Ltd\.?|Inc\.?|LLC|Ventures|Corp\.?|Co\.)(,|\s|$).*$/, "").replace(/\b(official|site|store|shop|home)\b/gi, "").replace(/[,:]+$/, "").trim();
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (t && (norm(t).includes(brand.key.slice(0, 4)) || brand.key.includes(norm(t).slice(0, 4)))) patch.name = t;
  }
  await sb.from("brands").update(patch).eq("id", brand.id);
}

// Idle-time backfill: check a few unverified brands per tick.
async function checkBrandSites(limit = 4) {
  const { data } = await sb.from("brands").select("id,key,name,domain,website,website_locked,name_locked").is("site_checked_at", null).order("deal_count", { ascending: false }).limit(limit);
  for (const b of data || []) {
    try { await resolveBrandSite(b); } catch (e: any) { log("site check failed", b.name, e?.message); }
  }
  return (data || []).length;
}

import { runResearch } from "./research";

async function tick() {
  const { data: jobs, error: pollErr } = await sb.from("scan_jobs").select("*")
    .in("status", ["queued", "rate_limited"]).lte("run_after", new Date().toISOString())
    .order("priority").order("created_at").limit(1);
  if (pollErr) { log("poll failed:", pollErr.message, "(check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"); return; }
  const job = jobs?.[0];
  if (!job) { if (!(await runResearch(sb))) { if (!(await checkBrandSites())) await classifyBackfill(sb); } return; }
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
