import { NextResponse, type NextRequest } from "next/server";
import { profileFromKey } from "@/lib/api-key";
import { supabaseAdmin, canSeeCreator } from "@/lib/supabase";
import { startScan } from "@/lib/scan-start";
import { track } from "@/lib/track";
import { cleanRef, findCreator, brandRows, printUrl, feedUrl } from "@/lib/ext";

// Sponsorprint for YouTube (Chrome extension).
//   GET  (no handle)            -> connection check { ok, email, feed_url }
//   GET  ?handle=<@handle|UC…>  -> does a print exist, is one running, and the brands on it.
//                                  Database only: the badge on every YouTube page costs no quota.
//   POST { handle, force? }     -> pull the print (same rules as the site: 14-day cache is free).
// Auth: Authorization: Bearer sp_… (the user's Sponsorprint key).

const FRESH_MS = 14 * 86400000;
const ACTIVE = ["queued", "running", "rate_limited"];

export async function GET(req: NextRequest) {
  const profile = await profileFromKey(req);
  if (!profile) return NextResponse.json({ ok: false, error: "Missing or invalid Sponsorprint key" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const ref = cleanRef(q.get("handle"));
  if (!ref) {
    const { data: me } = await supabaseAdmin().from("profiles").select("api_key").eq("id", profile.id).maybeSingle();
    return NextResponse.json({ ok: true, email: profile.email, feed_url: me?.api_key ? feedUrl(profile.id, me.api_key) : null });
  }
  const admin = supabaseAdmin();
  const creator = await findCreator("youtube", ref);

  // Is a print running? Check the job the extension started, else any live job for this channel.
  const jobId = q.get("job");
  let scanning = false; let failed: string | null = null;
  if (jobId && /^[0-9a-f-]{36}$/.test(jobId)) {
    const { data: job } = await admin.from("scan_jobs").select("status,error").eq("id", jobId).maybeSingle();
    if (job && ACTIVE.includes(job.status)) scanning = true;
    if (job?.status === "failed") failed = job.error || "The print failed. Try again in a minute.";
  } else {
    const handles = [...new Set([ref, creator?.handle, creator?.external_id].filter(Boolean) as string[])];
    const { data: jobs } = await admin.from("scan_jobs").select("id").eq("platform", "youtube").in("handle", handles).in("status", ACTIVE).limit(1);
    scanning = !!jobs?.length;
  }

  if (!creator?.last_scanned_at) return NextResponse.json({ ok: true, printed: false, scanning, failed });

  const canSee = await canSeeCreator(profile.id, profile.plan === "admin", creator);
  // Only real deal evidence (High / Medium). Bare links and hashtags stay on the full print, marked Low.
  const all = (await brandRows([creator.id], true)).get(creator.id) || [];
  const brands = all.filter((x) => x.confidence === "High" || x.confidence === "Medium");
  return NextResponse.json({
    ok: true, printed: true, scanning, failed,
    fresh: Date.now() - new Date(creator.last_scanned_at).getTime() < FRESH_MS,
    locked: !canSee,
    creator: { handle: creator.handle, name: creator.display_name || creator.handle, followers: creator.followers, category: creator.category, last_scanned_at: creator.last_scanned_at },
    brand_count: brands.length,
    low_count: all.length - brands.length,
    // Not yet opened by this user: the count shows on the badge, the list arrives after one click (free for cached prints).
    brands: canSee ? brands : [],
    print_url: printUrl(creator),
  });
}

export async function POST(req: NextRequest) {
  const profile = await profileFromKey(req);
  if (!profile) return NextResponse.json({ ok: false, error: "Missing or invalid Sponsorprint key" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ref = cleanRef(body.handle);
  if (!ref) return NextResponse.json({ ok: false, error: "No channel found on this page" }, { status: 400 });
  const r = await startScan(profile.id, { platform: "youtube", handle: ref, force: body.force === true }, "ext");
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  // One row per click: this is what the Google Sheet feed lists.
  track(profile.id, "ext_print", { platform: "youtube", handle: r.handle, cached: r.cached });
  return NextResponse.json({ ok: true, handle: r.handle, cached: r.cached, jobId: r.jobId || null });
}
