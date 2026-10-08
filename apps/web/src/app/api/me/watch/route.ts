import { NextResponse, type NextRequest } from "next/server";
import { portalViewer } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { track, alert } from "@/lib/track";

// Creators shape their own lane. Their follows are stored on the manager's watchlist, filed under this
// roster row, marked added_by=creator. Removing a MANAGER's pick never deletes the manager's watch: it
// adds a lane_mutes row so the creator stops seeing it, and the manager is told.
const clean = (raw: unknown) => String(raw || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(instagram\.com|youtube\.com)\//, "").replace(/\/.*$/, "").toLowerCase();

export async function POST(req: NextRequest) {
  const ctx = await portalViewer(); if (!ctx || !ctx.enabled) return NextResponse.json({ error: "Not available" }, { status: 403 });
  const { platform, handle: raw } = await req.json().catch(() => ({}));
  const handle = clean(raw);
  if (!handle || !["instagram", "youtube"].includes(platform)) return NextResponse.json({ error: "Enter a handle" }, { status: 400 });
  const admin = supabaseAdmin();
  // following someone you had hidden just unhides them
  const { data: muted } = await admin.from("lane_mutes").select("handle").eq("roster_creator_id", ctx.roster.id).eq("platform", platform).ilike("handle", handle).maybeSingle();
  if (muted) {
    await admin.from("lane_mutes").delete().eq("roster_creator_id", ctx.roster.id).eq("platform", platform).ilike("handle", handle);
    const { data: known } = await admin.from("creators").select("display_name,avatar_url,followers").eq("platform", platform).ilike("handle", handle).maybeSingle();
    track(ctx.roster.user_id, "creator_unmuted", { roster_creator_id: ctx.roster.id, creator: ctx.roster.name, platform, handle, name: known?.display_name || null });
    return NextResponse.json({ ok: true, handle, unmuted: true, name: known?.display_name || null, avatar: known?.avatar_url || null, followers: known?.followers || null });
  }
  const { count } = await admin.from("watchlist").select("*", { count: "exact", head: true }).eq("roster_creator_id", ctx.roster.id).eq("added_by", "creator");
  if ((count || 0) >= 25) return NextResponse.json({ error: "You're following 25 already; unfollow one first" }, { status: 400 });
  const { data: known } = await admin.from("creators").select("display_name,avatar_url,followers").eq("platform", platform).ilike("handle", handle).maybeSingle();
  await admin.from("watchlist").upsert({ user_id: ctx.roster.user_id, platform, handle, roster_creator_id: ctx.roster.id, added_by: "creator", known_brands: [], last_checked_at: new Date().toISOString() }, { onConflict: "user_id,platform,handle", ignoreDuplicates: true });
  const { data: q } = await admin.from("scan_jobs").select("id").eq("platform", platform).ilike("handle", handle).in("status", ["queued", "running", "rate_limited"]).limit(1);
  if (!q?.length && !known) await admin.from("scan_jobs").insert({ user_id: ctx.roster.user_id, platform, handle, priority: 2, source: "watch" });
  // tell the manager: an event on their timeline (shows on /watchlist and the creator page) and an alert (webhook if set)
  track(ctx.roster.user_id, "creator_followed", { roster_creator_id: ctx.roster.id, creator: ctx.roster.name, platform, handle, name: known?.display_name || null });
  alert(`${ctx.roster.name} started following @${handle} (${platform})`, { roster_creator_id: ctx.roster.id, platform, handle }).catch(() => {});
  return NextResponse.json({ ok: true, handle, name: known?.display_name || null, avatar: known?.avatar_url || null, followers: known?.followers || null });
}

// DELETE removes anyone from the creator's lane: own follows are deleted, manager picks are muted.
export async function DELETE(req: NextRequest) {
  const ctx = await portalViewer(); if (!ctx || !ctx.enabled) return NextResponse.json({ error: "Not available" }, { status: 403 });
  const { platform, handle: raw } = await req.json().catch(() => ({}));
  const handle = clean(raw);
  if (!handle || !["instagram", "youtube"].includes(platform)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: row } = await admin.from("watchlist").select("added_by").eq("roster_creator_id", ctx.roster.id).eq("platform", platform).ilike("handle", handle).maybeSingle();
  if (row?.added_by === "creator") {
    await admin.from("watchlist").delete().eq("user_id", ctx.roster.user_id).eq("roster_creator_id", ctx.roster.id).eq("added_by", "creator").eq("platform", platform).ilike("handle", handle);
    track(ctx.roster.user_id, "creator_unfollowed", { roster_creator_id: ctx.roster.id, creator: ctx.roster.name, platform, handle });
    return NextResponse.json({ ok: true, removed: "unfollowed" });
  }
  await admin.from("lane_mutes").upsert({ roster_creator_id: ctx.roster.id, platform, handle }, { onConflict: "roster_creator_id,platform,handle", ignoreDuplicates: true });
  const { data: known } = await admin.from("creators").select("display_name").eq("platform", platform).ilike("handle", handle).maybeSingle();
  track(ctx.roster.user_id, "creator_muted", { roster_creator_id: ctx.roster.id, creator: ctx.roster.name, platform, handle, name: known?.display_name || null });
  alert(`${ctx.roster.name} hid @${handle} (${platform}) from their lane; your watch is still on`, { roster_creator_id: ctx.roster.id, platform, handle }).catch(() => {});
  return NextResponse.json({ ok: true, removed: "muted" });
}

// GET ?platform=&handle= -> is this creator in my lane, who added them, and whether I've hidden them
export async function GET(req: NextRequest) {
  const ctx = await portalViewer(); if (!ctx || !ctx.enabled) return NextResponse.json({ error: "Not available" }, { status: 403 });
  const platform = req.nextUrl.searchParams.get("platform") || ""; const handle = clean(req.nextUrl.searchParams.get("handle"));
  const admin = supabaseAdmin();
  const [{ data }, { data: m }] = await Promise.all([
    admin.from("watchlist").select("added_by").eq("roster_creator_id", ctx.roster.id).eq("platform", platform).ilike("handle", handle).maybeSingle(),
    admin.from("lane_mutes").select("handle").eq("roster_creator_id", ctx.roster.id).eq("platform", platform).ilike("handle", handle).maybeSingle(),
  ]);
  return NextResponse.json({ inLane: !!data && !m, addedBy: data?.added_by || null, muted: !!m });
}
