import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { parseSignedRequest } from "@/lib/meta-signed";

// Meta "Deauthorize callback": the user removed Sponsorprint from their Facebook
// account. Drop every Instagram connection tied to that Facebook user.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const data = parseSignedRequest(String(form?.get("signed_request") || ""));
  if (!data?.user_id) return NextResponse.json({ error: "bad signed_request" }, { status: 400 });
  const admin = supabaseAdmin();
  await admin.from("ig_connections").delete().eq("fb_user_id", String(data.user_id)).eq("is_house", false);
  return NextResponse.json({ ok: true });
}
