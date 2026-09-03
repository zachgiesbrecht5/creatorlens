import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/supabase";

// Facebook Login for Business. The user picks the Page linked to their IG
// Business/Creator account; we get a long-lived token and the IG user id.
const SCOPES = ["instagram_basic", "pages_show_list", "pages_read_engagement", "business_management"].join(",");

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings", req.url));
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL}/api/ig/callback`;
  const state = Buffer.from(JSON.stringify({ u: user.id, t: Date.now() })).toString("base64url");
  const url = `https://www.facebook.com/v25.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirect)}&scope=${SCOPES}&state=${state}&response_type=code`;
  const res = NextResponse.redirect(url);
  res.cookies.set("cl_ig_state", state, { httpOnly: true, maxAge: 600, path: "/" });
  return res;
}
