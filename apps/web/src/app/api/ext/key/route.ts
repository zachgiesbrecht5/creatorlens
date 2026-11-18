import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { feedUrl } from "@/lib/ext";

// POST: the signed-in user's Sponsorprint key for the YouTube extension, plus their sheet feed link.
// Reuses the current key (never rotates it, so anything else using it keeps working);
// creates one only when the user has none.
export async function POST() {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  let key: string = profile.api_key;
  if (!key) {
    key = "sp_" + randomBytes(24).toString("base64url");
    await supabaseAdmin().from("profiles").update({ api_key: key, api_key_created_at: new Date().toISOString() }).eq("id", profile.id);
  }
  return NextResponse.json({ key, feed_url: feedUrl(profile.id, key) });
}
