import { NextResponse, type NextRequest } from "next/server";
import { currentUser, supabaseAdmin } from "@/lib/supabase";
import { redirectTo } from "@/lib/origin";

const V = "v25.0";
const fail = (req: NextRequest, msg: string) => NextResponse.redirect(redirectTo(req, `/settings?ig=${encodeURIComponent(msg)}`));

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(redirectTo(req, "/login"));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("cl_ig_state")?.value) return fail(req, "Instagram connect was cancelled or the state did not match.");
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL}/api/ig/callback`;

  // code -> short-lived -> long-lived user token
  const t1: any = await (await fetch(`https://graph.facebook.com/${V}/oauth/access_token?client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirect)}&code=${code}`)).json();
  if (!t1.access_token) return fail(req, "Meta did not return a token: " + (t1.error?.message || "unknown"));
  const t2: any = await (await fetch(`https://graph.facebook.com/${V}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${t1.access_token}`)).json();
  const token = t2.access_token || t1.access_token;
  const fbUserId: string | null = await fetch(`https://graph.facebook.com/v25.0/me?fields=id&access_token=${token}`).then((r) => r.json()).then((j) => (j?.id ? String(j.id) : null)).catch(() => null);

  // find pages with an IG business account
  const pages: any = await (await fetch(`https://graph.facebook.com/${V}/me/accounts?fields=name,instagram_business_account{id,username}&access_token=${token}`)).json();
  const withIg = (pages.data || []).filter((p: any) => p.instagram_business_account);
  if (!withIg.length) return fail(req, "No Instagram Business/Creator account is linked to a Facebook Page you manage. Link one in Instagram settings, then retry.");

  const admin = supabaseAdmin();
  const pageIgIds = new Set<string>();
  for (const p of withIg) {
    pageIgIds.add(String(p.instagram_business_account.id));
    await admin.from("ig_connections").upsert({
      user_id: user.id, ig_user_id: p.instagram_business_account.id, ig_username: p.instagram_business_account.username, fb_user_id: fbUserId,
      access_token: token, healthy: true, cooldown_until: null, last_error: null,
    }, { onConflict: "ig_user_id" });
  }
  // Instagram accounts inside the user's business portfolios (owned, or assigned by a creator):
  // each one is readable for insights (saves, shares, reach) and adds its own hourly allowance.
  try {
    const biz: any = await (await fetch(`https://graph.facebook.com/${V}/me/businesses?fields=id,name&access_token=${token}`)).json();
    for (const b of biz.data || []) {
      for (const edge of ["owned_instagram_accounts", "client_instagram_accounts"]) {
        const r: any = await (await fetch(`https://graph.facebook.com/${V}/${b.id}/${edge}?fields=id,username&limit=100&access_token=${token}`)).json();
        for (const ig of r.data || []) {
          await admin.from("ig_connections").upsert({ user_id: user.id, ig_user_id: String(ig.id), ig_username: ig.username, fb_user_id: fbUserId, access_token: token, healthy: true, cooldown_until: null, last_error: null, owned: true }, { onConflict: "ig_user_id" });
        }
      }
    }
    if (pageIgIds.size) await admin.from("ig_connections").update({ owned: true }).in("ig_user_id", [...pageIgIds]);
  } catch { /* business edges are optional */ }
  const res = NextResponse.redirect(redirectTo(req, "/settings?ig=ok"));
  res.cookies.delete("cl_ig_state");
  return res;
}
