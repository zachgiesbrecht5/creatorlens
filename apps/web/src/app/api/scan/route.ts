import { NextResponse, type NextRequest } from "next/server";
import { currentUser, supabaseAdmin, grantCreatorAccess } from "@/lib/supabase";
import { resolveChannel, isValidIgUsername } from "@creatorlens/engine";

const FRESH_DAYS = 14;

// POST { platform, handle } -> { handle, cached, jobId? }
// Cache-first: a creator scanned in the last 14 days costs nothing and no job
// is queued. Otherwise spend one scan credit and enqueue.
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const platform = body.platform === "instagram" ? "instagram" : "youtube";
  let handle = String(body.handle || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(youtube\.com|instagram\.com)\//, "").replace(/\/.*$/, "");
  if (!handle) return NextResponse.json({ error: "Enter a handle" }, { status: 400 });
  const admin = supabaseAdmin();

  // Resolve to a canonical handle so the cache hits.
  if (platform === "youtube") {
    if (!/^UC[A-Za-z0-9_-]{20,}$/.test(handle) && !/^[A-Za-z0-9._-]{3,30}$/.test(handle)) {
      // looks like a channel name, not a handle: one search.list call (100 units)
      const { searchChannels } = await import("@creatorlens/engine");
      const hits = await searchChannels(process.env.YT_API_KEY!, handle, 1);
      if (!hits.length) return NextResponse.json({ error: "No channel found for that name" }, { status: 404 });
      handle = hits[0].channelId;
    }
    const ch = await resolveChannel(process.env.YT_API_KEY!, handle).catch(() => null);
    if (!ch) return NextResponse.json({ error: "Channel not found. Try the @handle from the channel URL." }, { status: 404 });
    handle = (ch.handle || ch.id).replace(/^@/, "");
    const { data: cached } = await admin.from("creators").select("id,last_scanned_at").eq("platform", "youtube").eq("external_id", ch.id).maybeSingle();
    if (cached?.last_scanned_at && isFresh(cached.last_scanned_at)) { await grantCreatorAccess(user.id, "youtube", handle); await grantCreatorAccess(user.id, "youtube", ch.id); return NextResponse.json({ handle, cached: true }); }
  } else {
    handle = handle.toLowerCase();
    if (!isValidIgUsername(handle)) return NextResponse.json({ error: "That is not a valid Instagram username" }, { status: 400 });
    const { data: cached } = await admin.from("creators").select("id,last_scanned_at").eq("platform", "instagram").eq("handle", handle).maybeSingle();
    if (cached?.last_scanned_at && isFresh(cached.last_scanned_at)) { await grantCreatorAccess(user.id, "instagram", handle); return NextResponse.json({ handle, cached: true }); }
  }

  // Already queued by anyone? Piggyback, no charge.
  const { data: existing } = await admin.from("scan_jobs").select("id").eq("platform", platform).eq("handle", handle).in("status", ["queued", "running", "rate_limited"]).limit(1);
  if (existing?.length) { await grantCreatorAccess(user.id, platform, handle); return NextResponse.json({ handle, cached: false, jobId: existing[0].id, piggyback: true }); }

  const { data: ok } = await admin.rpc("spend_credit", { p_user: user.id, p_kind: "scan", p_reason: "scan", p_ref: `${platform}:${handle}` });
  if (!ok) return NextResponse.json({ error: "You're out of scan credits. Invite a teammate for 10 more, or upgrade." }, { status: 402 });

  const { data: job, error } = await admin.from("scan_jobs").insert({ user_id: user.id, platform, handle, priority: 3 }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await grantCreatorAccess(user.id, platform, handle);
  return NextResponse.json({ handle, cached: false, jobId: job.id });
}

function isFresh(iso: string) {
  return Date.now() - new Date(iso).getTime() < FRESH_DAYS * 86400000;
}
