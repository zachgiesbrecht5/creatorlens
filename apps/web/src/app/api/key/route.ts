import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
// POST: create (or rotate) the signed-in user's read-only API key. DELETE: revoke.
export async function POST() {
  const profile = await currentProfile(); if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const key = "sp_" + randomBytes(24).toString("base64url");
  await supabaseAdmin().from("profiles").update({ api_key: key, api_key_created_at: new Date().toISOString() }).eq("id", profile.id);
  return NextResponse.json({ key });
}
export async function DELETE() {
  const profile = await currentProfile(); if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await supabaseAdmin().from("profiles").update({ api_key: null, api_key_created_at: null }).eq("id", profile.id);
  return NextResponse.json({ ok: true });
}
