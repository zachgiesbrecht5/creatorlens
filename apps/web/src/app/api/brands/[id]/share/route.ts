import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { currentAccess, supabaseAdmin } from "@/lib/supabase";
import { track } from "@/lib/track";

// POST -> the brand's active share link (made if missing). DELETE -> turn it off.
// House only: these pages are what Rootfor sends to its own creators.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, insider } = await currentAccess();
  if (!profile || !insider) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("brand_shares").select("token").eq("brand_id", id).is("revoked_at", null).limit(1).maybeSingle();
  if (existing) return NextResponse.json({ token: existing.token });
  const token = randomBytes(12).toString("base64url");
  const { error } = await admin.from("brand_shares").insert({ token, brand_id: id, created_by: profile.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  track(profile.id, "brand_share", { brand_id: id });
  return NextResponse.json({ token });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, insider } = await currentAccess();
  if (!profile || !insider) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  await supabaseAdmin().from("brand_shares").update({ revoked_at: new Date().toISOString() }).eq("brand_id", id).is("revoked_at", null);
  return NextResponse.json({ ok: true });
}
