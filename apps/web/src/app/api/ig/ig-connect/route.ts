import { NextResponse, type NextRequest } from "next/server";
import { redirectTo } from "@/lib/origin";
import { currentUser } from "@/lib/supabase";

// Instagram Login: the creator signs in with their Instagram username and password. No Facebook Page,
// no business portfolio. Until Meta's App Review passes for these scopes, the account must be added as
// an "Instagram Tester" on the app and accept the invite in the Instagram app first.
const SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"].join(",");

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(redirectTo(req, "/login?next=/me"));
  if (!process.env.IG_APP_ID) return NextResponse.redirect(redirectTo(req, `/me?ig=${encodeURIComponent("Instagram login isn't configured yet (IG_APP_ID missing).")}`));
  const nextRaw = req.nextUrl.searchParams.get("next") || "/me";
  const next = /^\/[a-z0-9\-\/]*$/i.test(nextRaw) ? nextRaw : "/me";
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL}/api/ig/callback-ig`;
  const state = Buffer.from(JSON.stringify({ u: user.id, t: Date.now(), n: next })).toString("base64url");
  const url = `https://www.instagram.com/oauth/authorize?client_id=${process.env.IG_APP_ID}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(SCOPES)}&response_type=code&state=${state}&force_reauth=true`;
  const res = NextResponse.redirect(url);
  res.cookies.set("cl_ig_state", state, { httpOnly: true, maxAge: 600, path: "/" });
  return res;
}
