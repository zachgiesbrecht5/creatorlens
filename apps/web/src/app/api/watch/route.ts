import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { orgMemberIds } from "@/lib/org";
import { track } from "@/lib/track";

const FREE_LIMIT = 3;

// POST { platform, handle } toggles the creator on/off the watchlist.
export async function POST(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { platform, handle: raw, rosterCreatorId } = await req.json().catch(() => ({}));
  const handle = String(raw || "").replace(/^@/, "").toLowerCase();
  if (!handle || !["youtube", "instagram"].includes(platform)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const admin = supabaseAdmin();
  const members = await orgMemberIds(profile);
  const { data: existing } = await admin.from("watchlist").select("user_id,handle,roster_creator_id").in("user_id", members).eq("platform", platform).eq("handle", handle).order("user_id").limit(1).maybeSingle();
  if (existing && rosterCreatorId !== undefined && rosterCreatorId !== existing.roster_creator_id) {
    // already watching: just move it to another creator's lane
    await admin.from("watchlist").update({ roster_creator_id: rosterCreatorId || null }).eq("user_id", existing.user_id).eq("platform", platform).eq("handle", handle);
    return NextResponse.json({ watching: true, rosterCreatorId: rosterCreatorId || null });
  }
  if (existing) { await admin.from("watchlist").delete().eq("user_id", existing.user_id).eq("platform", platform).eq("handle", handle); return NextResponse.json({ watching: false }); }
  const paid = ["pro", "agency", "team", "admin"].includes(profile.plan);
  if (!paid) { const { count } = await admin.from("watchlist").select("*", { count: "exact", head: true }).eq("user_id", profile.id); if ((count || 0) >= FREE_LIMIT) return NextResponse.json({ error: `The free plan watches ${FREE_LIMIT} creators. Upgrade for an unlimited watchlist.` }, { status: 402 }); }
  // baseline: brands already on the print, so only future additions count as new
  const { data: c } = await admin.from("creators").select("id").eq("platform", platform).ilike("handle", handle).maybeSingle();
  const { data: wall } = c ? await admin.from("brand_wall_mv").select("brand").eq("creator_id", c.id).eq("is_junk", false) : { data: [] };
  await admin.from("watchlist").insert({ user_id: profile.id, platform, handle, roster_creator_id: rosterCreatorId || null, known_brands: (wall || []).map((b) => b.brand), last_checked_at: new Date().toISOString() });
  track(profile.id, "watch", { platform, handle, roster_creator_id: rosterCreatorId || null });
  // not printed yet: queue a low-priority print so the hooks and brands arrive when the pool has room; no credit, no waiting on the page
  if (!c) {
    const { data: q } = await admin.from("scan_jobs").select("id").eq("platform", platform).ilike("handle", handle).in("status", ["queued", "running", "rate_limited"]).limit(1);
    if (!q?.length) await admin.from("scan_jobs").insert({ user_id: profile.id, platform, handle, priority: 3, source: "watch" });
  }
  return NextResponse.json({ watching: true, rosterCreatorId: rosterCreatorId || null, queued: !c });
}

// PATCH marks all watch events seen
export async function PATCH() {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await supabaseAdmin().from("watch_events").update({ seen: true }).eq("user_id", profile.id).eq("seen", false);
  return NextResponse.json({ ok: true });
}
