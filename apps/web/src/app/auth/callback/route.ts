import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase";
import { redirectTo } from "@/lib/origin";

// Google OAuth return. Stores the Gmail refresh token (if the user granted the
// compose scope) and applies a referral code carried in the cookie.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") || "/";
  if (!code) return NextResponse.redirect(redirectTo(req, "/login?error=missing_code"));

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(redirectTo(req, "/login?error=" + encodeURIComponent(error?.message || "auth")));

  const admin = supabaseAdmin();
  const user = data.session.user;
  if (data.session.provider_refresh_token && req.nextUrl.searchParams.get("gmail") === "1") {
    await admin.from("google_connections").upsert({
      user_id: user.id,
      refresh_token: data.session.provider_refresh_token,
      scopes: ["https://www.googleapis.com/auth/gmail.compose"],
      email: user.email,
      updated_at: new Date().toISOString(),
    });
  }
  const ref = req.cookies.get("cl_ref")?.value;
  if (ref) await admin.rpc("apply_referral", { p_new_user: user.id, p_code: ref });

  const res = NextResponse.redirect(redirectTo(req, next));
  res.cookies.delete("cl_ref");
  return res;
}
