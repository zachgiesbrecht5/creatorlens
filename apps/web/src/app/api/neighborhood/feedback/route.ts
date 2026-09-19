import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { track } from "@/lib/track";

// POST { hoodId, handle, platform, verdict: "like" | "pass" }
export async function POST(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { hoodId, handle, platform, verdict } = await req.json().catch(() => ({}));
  if (!["like", "pass"].includes(verdict) || !handle) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: n } = await admin.from("neighborhoods").select("user_id,roster_creator_id,creator_id").eq("id", hoodId).single();
  if (!n || n.user_id !== profile.id) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  await admin.from("lane_feedback").insert({ user_id: profile.id, roster_creator_id: n.roster_creator_id, seed_creator_id: n.creator_id, platform, handle: String(handle).toLowerCase(), verdict });
  track(profile.id, "lane_feedback", { verdict, handle });
  return NextResponse.json({ ok: true });
}
