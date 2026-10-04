import { NextResponse, type NextRequest } from "next/server";
import { creatorContext } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";

// Creators follow creators in their own lane. Stored on the manager's watchlist, filed under this roster row, marked added_by=creator.
export async function POST(req: NextRequest) {
  const ctx = await creatorContext(); if (!ctx || !ctx.enabled) return NextResponse.json({ error: "Not available" }, { status: 403 });
  const { platform, handle: raw } = await req.json().catch(() => ({}));
  const handle = String(raw || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(instagram\.com|youtube\.com)\//, "").replace(/\/.*$/, "").toLowerCase();
  if (!handle || !["instagram", "youtube"].includes(platform)) return NextResponse.json({ error: "Enter a handle" }, { status: 400 });
  const admin = supabaseAdmin();
  const { count } = await admin.from("watchlist").select("*", { count: "exact", head: true }).eq("roster_creator_id", ctx.roster.id).eq("added_by", "creator");
  if ((count || 0) >= 25) return NextResponse.json({ error: "You're following 25 already; unfollow one first" }, { status: 400 });
  const { data: known } = await admin.from("creators").select("display_name,avatar_url,followers").eq("platform", platform).ilike("handle", handle).maybeSingle();
  await admin.from("watchlist").upsert({ user_id: ctx.roster.user_id, platform, handle, roster_creator_id: ctx.roster.id, added_by: "creator", known_brands: [], last_checked_at: new Date().toISOString() }, { onConflict: "user_id,platform,handle", ignoreDuplicates: true });
  const { data: q } = await admin.from("scan_jobs").select("id").eq("platform", platform).ilike("handle", handle).in("status", ["queued", "running", "rate_limited"]).limit(1);
  if (!q?.length && !known) await admin.from("scan_jobs").insert({ user_id: ctx.roster.user_id, platform, handle, priority: 2, source: "watch" });
  return NextResponse.json({ ok: true, handle, name: known?.display_name || null, avatar: known?.avatar_url || null, followers: known?.followers || null });
}
export async function DELETE(req: NextRequest) {
  const ctx = await creatorContext(); if (!ctx || !ctx.enabled) return NextResponse.json({ error: "Not available" }, { status: 403 });
  const { platform, handle } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  await admin.from("watchlist").delete().eq("user_id", ctx.roster.user_id).eq("roster_creator_id", ctx.roster.id).eq("added_by", "creator").eq("platform", platform).ilike("handle", String(handle || ""));
  return NextResponse.json({ ok: true });
}
