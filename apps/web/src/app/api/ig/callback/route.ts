import { NextResponse, type NextRequest } from "next/server";
import { currentUser, supabaseAdmin } from "@/lib/supabase";

const V = "v25.0";
const fail = (req: NextRequest, msg: string) => NextResponse.redirect(new URL(`/settings?ig=${encodeURIComponent(msg)}`, req.url));

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("cl_ig_state")?.value) return fail(req, "Instagram connect was cancelled or the state did not match.");
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL}/api/ig/callback`;

  // code -> short-lived -> long-lived user token
  const t1: any = await (await fetch(`https://graph.facebook.com/${V}/oauth/access_token?client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirect)}&code=${code}`)).json();
  if (!t1.access_token) return fail(req, "Meta did not return a token: " + (t1.error?.message || "unknown"));
  const t2: any = await (await fetch(`https://graph.facebook.com/${V}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${t1.access_token}`)).json();
  const token = t2.access_token || t1.access_token;

  // find pages with an IG business account
  const pages: any = await (await fetch(`https://graph.facebook.com/${V}/me/accounts?fields=name,instagram_business_account{id,username}&access_token=${token}`)).json();
  const withIg = (pages.data || []).filter((p: any) => p.instagram_business_account);
  if (!withIg.length) return fail(req, "No Instagram Business/Creator account is linked to a Facebook Page you manage. Link one in Instagram settings, then retry.");

  const admin = supabaseAdmin();
  for (const p of withIg) {
    await admin.from("ig_connections").upsert({
      user_id: user.id, ig_user_id: p.instagram_business_account.id, ig_username: p.instagram_business_account.username,
      access_token: token, healthy: true, cooldown_until: null, last_error: null,
    }, { onConflict: "ig_user_id" });
  }
  const res = NextResponse.redirect(new URL("/settings?ig=ok", req.url));
  res.cookies.delete("cl_ig_state");
  return res;
}
