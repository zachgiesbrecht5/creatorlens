import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

// POST: the signed-in admin's existing Sponsorprint key for the Sales Nav extension.
// Reuses the current key (never rotates it, so the outreach skills keep working);
// creates one only when the admin has none.
export async function POST() {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (profile.plan !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  if (profile.api_key) return NextResponse.json({ key: profile.api_key });
  const key = "sp_" + randomBytes(24).toString("base64url");
  await supabaseAdmin().from("profiles").update({ api_key: key, api_key_created_at: new Date().toISOString() }).eq("id", profile.id);
  return NextResponse.json({ key });
}
