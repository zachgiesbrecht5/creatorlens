import { supabaseAdmin, grantCreatorAccess } from "@/lib/supabase";
import { track } from "@/lib/track";
import { resolveChannel, isValidIgUsername } from "@creatorlens/engine";

const FRESH_DAYS = 14;
const isFresh = (iso: string) => Date.now() - new Date(iso).getTime() < FRESH_DAYS * 86400000;

export type StartScanResult =
  | { ok: true; handle: string; cached: boolean; jobId?: string; piggyback?: boolean }
  | { ok: false; status: number; error: string };

/**
 * Start (or reuse) a print for one creator. Shared by the site's POST /api/scan and the
 * Chrome extension's POST /api/ext/print.
 * Cache-first: a creator scanned in the last 14 days costs nothing and no job is queued.
 * Otherwise spend one scan credit and enqueue.
 */
export async function startScan(userId: string, input: { platform?: unknown; handle?: unknown; force?: unknown }, source: "web" | "ext" = "web"): Promise<StartScanResult> {
  const platform = input.platform === "instagram" ? "instagram" : "youtube";
  const force = input.force === true;   // re-print: skip the freshness cache
  let handle = String(input.handle || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(youtube\.com|instagram\.com)\//, "").replace(/\/.*$/, "");
  if (!handle) return { ok: false, status: 400, error: "Enter a handle" };
  const admin = supabaseAdmin();
  const props = (extra: Record<string, unknown> = {}) => ({ platform, handle, ...(source === "ext" ? { source } : {}), ...extra });

  // Resolve to a canonical handle so the cache hits.
  if (platform === "youtube") {
    if (!/^UC[A-Za-z0-9_-]{20,}$/.test(handle) && !/^[A-Za-z0-9._-]{3,30}$/.test(handle)) {
      // looks like a channel name, not a handle: one search.list call (100 units)
      const { searchChannels } = await import("@creatorlens/engine");
      const hits = await searchChannels(process.env.YT_API_KEY!, handle, 1);
      if (!hits.length) return { ok: false, status: 404, error: "No channel found for that name" };
      handle = hits[0].channelId;
    }
    const ch = await resolveChannel(process.env.YT_API_KEY!, handle).catch(() => null);
    if (!ch) return { ok: false, status: 404, error: "Channel not found. Try the @handle from the channel URL." };
    handle = (ch.handle || ch.id).replace(/^@/, "");
    const { data: cached } = await admin.from("creators").select("id,last_scanned_at").eq("platform", "youtube").eq("external_id", ch.id).maybeSingle();
    if (!force && cached?.last_scanned_at && isFresh(cached.last_scanned_at)) {
      await grantCreatorAccess(userId, "youtube", handle); await grantCreatorAccess(userId, "youtube", ch.id);
      track(userId, "print_cached", props());
      return { ok: true, handle, cached: true };
    }
  } else {
    handle = handle.toLowerCase();
    if (!isValidIgUsername(handle)) return { ok: false, status: 400, error: "That is not a valid Instagram username" };
    const { data: cached } = await admin.from("creators").select("id,last_scanned_at").eq("platform", "instagram").eq("handle", handle).maybeSingle();
    if (!force && cached?.last_scanned_at && isFresh(cached.last_scanned_at)) {
      await grantCreatorAccess(userId, "instagram", handle);
      track(userId, "print_cached", props());
      return { ok: true, handle, cached: true };
    }
  }

  // Already queued by anyone? Piggyback, no charge.
  const { data: existing } = await admin.from("scan_jobs").select("id").eq("platform", platform).eq("handle", handle).in("status", ["queued", "running", "rate_limited"]).limit(1);
  if (existing?.length) { await grantCreatorAccess(userId, platform, handle); return { ok: true, handle, cached: false, jobId: existing[0].id, piggyback: true }; }

  const { data: ok } = await admin.rpc("spend_credit", { p_user: userId, p_kind: "scan", p_reason: "scan", p_ref: `${platform}:${handle}` });
  if (!ok) { track(userId, "print_locked", props()); return { ok: false, status: 402, error: "You've pulled 25 new prints today, the free-plan daily limit. Cached prints still open, and it resets tomorrow. Pro has no limit." }; }

  const { data: job, error } = await admin.from("scan_jobs").insert({ user_id: userId, platform, handle, priority: 3 }).select("id").single();
  if (error) return { ok: false, status: 500, error: error.message };
  await grantCreatorAccess(userId, platform, handle);
  track(userId, "print", props());
  return { ok: true, handle, cached: false, jobId: job.id };
}
