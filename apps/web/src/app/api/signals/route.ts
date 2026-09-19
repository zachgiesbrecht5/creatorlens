import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { regionFor } from "@/lib/region";

// PATCH { rosterCreatorId, location } -> set where a creator is based
export async function PATCH(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { rosterCreatorId, location } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: rc } = await admin.from("roster_creators").select("id,user_id").eq("id", rosterCreatorId).single();
  if (!rc || rc.user_id !== profile.id) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const loc = String(location || "").trim().slice(0, 80);
  await admin.from("roster_creators").update({ location: loc || null, region: loc ? regionFor(loc) : null }).eq("id", rc.id);
  return NextResponse.json({ ok: true, region: loc ? regionFor(loc) : null });
}

// POST marks matches seen
export async function POST() {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await supabaseAdmin().from("signal_matches").update({ seen: true }).eq("user_id", profile.id).eq("seen", false);
  return NextResponse.json({ ok: true });
}
