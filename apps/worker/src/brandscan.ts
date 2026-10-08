// Brand print. For a brand, find the creators behind its disclosed deals on BOTH
// platforms, then queue their prints (free, source=brandscan, capped). The print is
// what confirms a deal: no confirmed disclosure, no row on the brand wall.
//
// YouTube: three searches over disclosures (#XPartner, "sponsored by X", "X" sponsor).
// Instagram has no search API, so it comes from four angles:
//   1. linked     the Instagram handle a matched YouTube channel links in its description
//   2. credit     creators the brand tags in its own recent posts (business_discovery)
//   3. hashtag    authors of #XPartner posts (top + last-24h), read through oEmbed when
//                 Meta's oEmbed Read is approved (Meta never returns the poster directly)
//   4. pulse      the #XPartner post count, kept as a spend signal
// Every Instagram candidate is verified as a professional account before it's printed.
// Nightly: the ten brands people viewed most this week that haven't been scanned in 30 days.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  searchVideoChannels, channelDescriptions, hashtagMedia, pulseFrom, oembedAuthor, captionMentions,
  linkedInstagram, lookupIgProfile, fetchIgCreator, IgRateLimitError, type IgToken,
} from "@creatorlens/engine";
import { alert } from "./observe";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[brandscan]", ...a);
const YT_KEY = process.env.YT_API_KEY || "";
const MAX_PRINTS = Number(process.env.BRANDSCAN_MAX_PRINTS || 12);
const MAX_IG_PRINTS = Number(process.env.BRANDSCAN_MAX_IG_PRINTS || 12);
const IG_VERIFY_MAX = Number(process.env.BRANDSCAN_IG_VERIFY_MAX || 30);
const APP_TOKEN = process.env.META_APP_ID && process.env.META_APP_SECRET ? `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}` : null;

// Accounts that show up in brand captions but are never the creator: retailers, marketplaces, platforms.
export const NOT_CREATORS = new Set([
  "sephora", "sephoracanada", "ulta", "ultabeauty", "target", "walmart", "amazon", "amazonfashion", "costco", "bestbuy", "nordstrom",
  "macys", "kohls", "cvs", "walgreens", "shoppers", "shoppersdrugmart", "bootsuk", "spacenk", "revolve", "credobeauty", "dermstore",
  "wholefoods", "traderjoes", "kroger", "safeway", "loblaws", "instagram", "creators", "tiktok", "youtube", "facebook", "meta", "shopify",
  "ltk.creators", "shop.ltk", "liketoknow.it", "ltk", "amazoninfluencer", "giveaway", "giveaways",
]);

type Cand = { handle: string; via: Set<string>; evidence: string; url: string | null; published_at: string | null; score: number };

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

async function spendYt(sb: SupabaseClient, units: number) {
  const day = new Date().toISOString().slice(0, 10);
  const { data: hq } = await sb.from("house_quota").select("yt_units").eq("day", day).maybeSingle();
  await sb.from("house_quota").upsert({ day, yt_units: Number(hq?.yt_units || 0) + units });
}

async function igToken(sb: SupabaseClient): Promise<(IgToken & { id: string }) | null> {
  const { data } = await sb.from("ig_connections").select("id,ig_user_id,access_token").eq("healthy", true).eq("api_host", "facebook").or(`cooldown_until.is.null,cooldown_until.lt.${new Date().toISOString()}`).order("calls_this_hour", { ascending: true }).limit(1).maybeSingle();
  return data ? { id: data.id, igUserId: data.ig_user_id, accessToken: data.access_token } : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The brand's Instagram handle: the one we know, or a verified guess from its name / domain. */
async function brandHandle(sb: SupabaseClient, tok: IgToken, brand: { id: string; name: string; domain?: string | null; ig_handle?: string | null }): Promise<string | null> {
  if (brand.ig_handle) return String(brand.ig_handle).replace(/^@/, "").toLowerCase();
  const stem = String(brand.domain || "").replace(/^www\./, "").toLowerCase();
  const guesses = [...new Set([norm(brand.name), stem.split(".")[0], stem, `${norm(brand.name)}official`, `${norm(brand.name)}beauty`].filter((g) => g && g.length >= 3))];
  for (const g of guesses.slice(0, 4)) {
    const p = await lookupIgProfile(tok, g).catch((e) => { if (e instanceof IgRateLimitError) throw e; return null; });
    if (!p) continue;
    const key = norm(brand.name);
    if (norm(p.username).includes(key) || norm(p.name).includes(key) || (stem && norm(p.username) === norm(stem))) {
      await sb.from("brands").update({ ig_handle: p.username }).eq("id", brand.id);
      return p.username.toLowerCase();
    }
  }
  return null;
}

async function scanOne(sb: SupabaseClient, id: string, brandId: string, requestedBy: string | null) {
  const { data: brand } = await sb.from("brands").select("id,name,domain,ig_handle").eq("id", brandId).single();
  if (!brand) throw new Error("brand missing");
  const slug = brand.name.replace(/[^A-Za-z0-9]/g, "");
  const found: any[] = [];
  const seen = new Set<string>();

  // ── YouTube ────────────────────────────────────────────────
  if (YT_KEY) {
    for (const q of [`#${slug}Partner`, `"sponsored by ${brand.name}"`, `"${brand.name}" sponsor`]) {
      try {
        const chans = await searchVideoChannels(YT_KEY, q, 25);
        for (const c of chans) { if (seen.has(c.channelId)) continue; seen.add(c.channelId); found.push({ platform: "youtube", via: ["search"], handle: c.channelId, external_id: c.channelId, title: c.title, video_title: c.videoTitle, video_id: c.videoId, post_url: `https://www.youtube.com/watch?v=${c.videoId}`, published_at: c.publishedAt, query: q, queued: false }); }
        await spendYt(sb, 100);
      } catch (e: any) { log("yt query failed", q, e?.message); }
    }
  }
  let queued = 0;
  for (const f of [...found].sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))) {
    if (queued >= MAX_PRINTS) break;
    const { data: known } = await sb.from("creators").select("id,last_scanned_at,handle").eq("platform", "youtube").eq("external_id", f.external_id).maybeSingle();
    f.known = !!known?.last_scanned_at; f.creator_handle = known?.handle || null;
    if (known?.last_scanned_at && Date.now() - new Date(known.last_scanned_at).getTime() < 30 * 864e5) { f.queued = "cached"; continue; }
    const { data: existing } = await sb.from("scan_jobs").select("id").eq("platform", "youtube").eq("handle", f.external_id).in("status", ["queued", "running", "rate_limited"]).limit(1);
    if (existing?.length) { f.queued = true; continue; }
    await sb.from("scan_jobs").insert({ user_id: requestedBy, platform: "youtube", handle: f.external_id, priority: 8, source: "brandscan" });
    f.queued = true; queued++;
  }

  // ── Instagram ──────────────────────────────────────────────
  const cands = new Map<string, Cand>();
  const add = (handle: string, via: string, evidence: string, url: string | null, at: string | null, score: number) => {
    const h = handle.toLowerCase();
    const c = cands.get(h);
    if (c) { c.via.add(via); c.score += score; if (!c.url && url) { c.url = url; c.evidence = evidence; c.published_at = at; } return; }
    cands.set(h, { handle: h, via: new Set([via]), evidence, url, published_at: at, score });
  };
  const ig: any = { brand_handle: null, oembed: APP_TOKEN ? "untried" : "no app token", candidates: 0, verified: 0, queued: 0, notes: [] as string[] };
  let pulse: any = null;

  // 1. linked from the YouTube channels we just found (1 unit per 50 channels)
  if (YT_KEY && found.length) {
    try {
      const desc = await channelDescriptions(YT_KEY, found.map((f) => f.external_id));
      await spendYt(sb, Math.ceil(found.length / 50));
      for (const f of found) { const h = linkedInstagram(desc.get(f.external_id) || ""); if (h) { f.ig_handle = h; add(h, "linked", f.video_title, f.post_url, f.published_at, 3); } }
    } catch (e: any) { log("channel descriptions failed", e?.message); }
  }

  const tok = await igToken(sb);
  if (!tok) ig.notes.push("no Instagram connection available");
  let bh: string | null = null;
  if (tok) {
    try {
      // 2. creators the brand credits in its own recent posts
      bh = await brandHandle(sb, tok, brand);
      ig.brand_handle = bh;
      if (bh) {
        const { posts } = await fetchIgCreator(tok, bh, 50, 50);
        const cutoff = Date.now() - 180 * 864e5;
        for (const p of posts) {
          if (new Date(p.timestamp).getTime() < cutoff) continue;
          for (const h of captionMentions(p.caption)) add(h, "credit", p.caption.replace(/\s+/g, " ").slice(0, 200), p.permalink, p.timestamp, 1);
        }
      } else ig.notes.push("brand's Instagram handle unknown");

      // 3 + 4. #XPartner: the pulse, and the posters when oEmbed can name them
      const hm = await hashtagMedia(tok, `${slug}partner`);
      if (hm) {
        pulse = pulseFrom(hm);
        let misses = 0, hits = 0;
        if (APP_TOKEN) {
          for (const p of hm.posts.slice(0, 30)) {
            if (!p.permalink) continue;
            const h = await oembedAuthor(APP_TOKEN, p.permalink);
            if (h) { hits++; add(h, "hashtag", p.caption.replace(/\s+/g, " ").slice(0, 200), p.permalink, p.timestamp, 4); }
            else if (++misses >= 3 && hits === 0) break;   // oEmbed not approved / no author in this API version
          }
          ig.oembed = hits ? "ok" : hm.posts.length ? "no author returned" : "no posts";
        }
      }
    } catch (e: any) {
      if (e instanceof IgRateLimitError) { ig.notes.push("Instagram rate limit hit; partial results"); await sb.from("ig_connections").update({ cooldown_until: new Date(Date.now() + 45 * 60e3).toISOString(), last_error: String(e.message).slice(0, 300) }).eq("id", tok.id); }
      else { log("ig discovery failed", e?.message); ig.notes.push(String(e?.message || e).slice(0, 120)); }
    }
  }

  // drop the brand itself, retailers, and anything we know is a brand account
  const list = [...cands.values()].filter((c) => c.handle !== bh && !NOT_CREATORS.has(c.handle) && !(norm(brand.name).length >= 4 && c.handle.replace(/[^a-z0-9]/g, "").startsWith(norm(brand.name))));
  if (list.length) {
    const { data: brandAccts } = await sb.from("brands").select("ig_handle").in("ig_handle", list.map((c) => c.handle));
    const brandSet = new Set((brandAccts || []).map((b) => String(b.ig_handle).toLowerCase()));
    for (let i = list.length - 1; i >= 0; i--) if (brandSet.has(list[i].handle)) list.splice(i, 1);
  }
  ig.candidates = list.length;
  list.sort((a, b) => b.score - a.score || String(b.published_at).localeCompare(String(a.published_at)));

  // verify (professional account) and queue prints
  const verifyTok = await igToken(sb);
  let igQueued = 0;
  for (const c of list.slice(0, IG_VERIFY_MAX)) {
    if (!verifyTok) break;
    let p: Awaited<ReturnType<typeof lookupIgProfile>> = null;
    try { p = await lookupIgProfile(verifyTok, c.handle); }
    catch (e) { if (e instanceof IgRateLimitError) { ig.notes.push("rate limit during verification"); break; } }
    if (!p) continue;   // private, personal, or gone
    ig.verified++;
    const row: any = { platform: "instagram", via: [...c.via], handle: p.username.toLowerCase(), external_id: p.id || p.username.toLowerCase(), title: p.name || p.username, video_title: c.evidence, post_url: c.url, published_at: c.published_at, followers: p.followers, avatar_url: p.avatar, queued: false };
    const { data: known } = await sb.from("creators").select("id,last_scanned_at,handle").eq("platform", "instagram").ilike("handle", row.handle).maybeSingle();
    row.known = !!known?.last_scanned_at;
    if (known?.last_scanned_at && Date.now() - new Date(known.last_scanned_at).getTime() < 30 * 864e5) row.queued = "cached";
    else if (igQueued < MAX_IG_PRINTS) {
      const { data: existing } = await sb.from("scan_jobs").select("id").eq("platform", "instagram").ilike("handle", row.handle).in("status", ["queued", "running", "rate_limited"]).limit(1);
      if (!existing?.length) { await sb.from("scan_jobs").insert({ user_id: requestedBy, platform: "instagram", handle: row.handle, priority: 8, source: "brandscan" }); igQueued++; }
      row.queued = true;
    } else row.queued = "over cap";
    found.push(row);
  }
  ig.queued = igQueued;

  if (requestedBy) for (const f of found) await sb.from("creator_access").upsert({ user_id: requestedBy, platform: f.platform, handle: String(f.platform === "youtube" ? f.external_id : f.handle).toLowerCase() }, { onConflict: "user_id,platform,handle", ignoreDuplicates: true });
  const igPulse = { ...(pulse || { tag: `${slug}partner`.toLowerCase(), posts: null, sample: [] }), ...ig };
  await sb.from("brand_scans").update({ status: "done", found, ig_pulse: igPulse, finished_at: new Date().toISOString() }).eq("id", id);
  await sb.from("brands").update({ last_brand_scan_at: new Date().toISOString(), ...(pulse ? { ig_pulse: { ...pulse, checked_at: new Date().toISOString() } } : {}) }).eq("id", brandId);
  log(brand.name, found.filter((f) => f.platform === "youtube").length, "YT channels,", queued, "YT prints;", ig.verified, "IG creators verified,", igQueued, "IG prints; brand @", bh || "?", "oembed", ig.oembed);
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
