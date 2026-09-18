import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { track } from "@/lib/track";

const FREE_LIMIT = 3;

// POST { platform, handle } toggles the creator on/off the watchlist.
export async function POST(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { platform, handle: raw } = await req.json().catch(() => ({}));
  const handle = String(raw || "").replace(/^@/, "").toLowerCase();
  if (!handle || !["youtube", "instagram"].includes(platform)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("watchlist").select("handle").eq("user_id", profile.id).eq("platform", platform).eq("handle", handle).maybeSingle();
  if (existing) { await admin.from("watchlist").delete().eq("user_id", profile.id).eq("platform", platform).eq("handle", handle); return NextResponse.json({ watching: false }); }
  const paid = ["pro", "agency", "team", "admin"].includes(profile.plan);
  if (!paid) { const { count } = await admin.from("watchlist").select("*", { count: "exact", head: true }).eq("user_id", profile.id); if ((count || 0) >= FREE_LIMIT) return NextResponse.json({ error: `The free plan watches ${FREE_LIMIT} creators. Upgrade for an unlimited watchlist.` }, { status: 402 }); }
  // baseline: brands already on the print, so only future additions count as new
  const { data: c } = await admin.from("creators").select("id").eq("platform", platform).ilike("handle", handle).maybeSingle();
  const { data: wall } = c ? await admin.from("brand_wall").select("brand").eq("creator_id", c.id).eq("is_junk", false) : { data: [] };
  await admin.from("watchlist").insert({ user_id: profile.id, platform, handle, known_brands: (wall || []).map((b) => b.brand), last_checked_at: new Date().toISOString() });
  track(profile.id, "watch", { platform, handle });
  return NextResponse.json({ watching: true });
}

// PATCH marks all watch events seen
export async function PATCH() {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await supabaseAdmin().from("watch_events").update({ seen: true }).eq("user_id", profile.id).eq("seen", false);
  return NextResponse.json({ ok: true });
}
