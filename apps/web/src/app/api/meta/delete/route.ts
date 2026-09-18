import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { parseSignedRequest } from "@/lib/meta-signed";

// Meta "Data deletion request callback". Must return a status URL and a
// confirmation code. We delete the user's Instagram connections immediately
// and log the request so the status page can confirm it.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const data = parseSignedRequest(String(form?.get("signed_request") || ""));
  if (!data?.user_id) return NextResponse.json({ error: "bad signed_request" }, { status: 400 });
  const admin = supabaseAdmin();
  const code = `del_${Math.random().toString(36).slice(2, 10)}`;
  await admin.from("ig_connections").delete().eq("fb_user_id", String(data.user_id)).eq("is_house", false);
  await admin.from("events").insert({ user_id: null, name: "meta_data_deletion", props: { fb_user_id: String(data.user_id), code } });
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://sponsorprint.com";
  return NextResponse.json({ url: `${base}/data-deletion?code=${code}`, confirmation_code: code });
}
