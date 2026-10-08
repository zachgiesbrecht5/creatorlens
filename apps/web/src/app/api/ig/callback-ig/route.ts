import { NextResponse, type NextRequest } from "next/server";
import { currentUser, supabaseAdmin } from "@/lib/supabase";
import { redirectTo } from "@/lib/origin";
import { track } from "@/lib/track";

// Instagram Login callback: code -> short-lived token -> 60-day token -> profile. Stored on
// ig_connections with api_host=instagram so the worker reads it through graph.instagram.com.
const V = "v25.0";
const nextOf = (req: NextRequest) => { try { const n = JSON.parse(Buffer.from(req.nextUrl.searchParams.get("state") || "", "base64url").toString()).n; return typeof n === "string" && /^\/[a-z0-9\-\/]*$/i.test(n) ? n : "/me"; } catch { return "/me"; } };
const fail = (req: NextRequest, msg: string) => NextResponse.redirect(redirectTo(req, `${nextOf(req)}?ig=${encodeURIComponent(msg)}`));

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(redirectTo(req, "/login"));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const denied = req.nextUrl.searchParams.get("error");
  if (denied) return fail(req, `Instagram said no: ${req.nextUrl.searchParams.get("error_description") || denied}. If it says the app isn't available to you, your manager needs to add your account as an Instagram Tester and you accept the invite in Instagram (Settings > Apps and websites > Tester invites).`);
  if (!code || !state || state !== req.cookies.get("cl_ig_state")?.value) return fail(req, "Instagram connect was cancelled or the state did not match.");
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL}/api/ig/callback-ig`;

  // short-lived token (POST form), then the 60-day token
  const form = new URLSearchParams({ client_id: String(process.env.IG_APP_ID), client_secret: String(process.env.IG_APP_SECRET), grant_type: "authorization_code", redirect_uri: redirect, code: code.replace(/#_$/, "") });
  const t1: any = await (await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form })).json();
  if (!t1.access_token) return fail(req, "Instagram did not return a token: " + (t1.error_message || t1.error?.message || "unknown"));
  const t2: any = await (await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.IG_APP_SECRET}&access_token=${t1.access_token}`)).json();
  const token: string = t2.access_token || t1.access_token;
  const expires = new Date(Date.now() + (Number(t2.expires_in) || 3600) * 1000).toISOString();

  const me: any = await (await fetch(`https://graph.instagram.com/${V}/me?fields=user_id,username,account_type,followers_count,media_count&access_token=${token}`)).json();
  if (!me?.username) return fail(req, "Could not read the Instagram profile: " + (me?.error?.message || "unknown"));
  const igUserId = String(me.user_id || me.id || t1.user_id);

  const admin = supabaseAdmin();
  const { error } = await admin.from("ig_connections").upsert({
    user_id: user.id, ig_user_id: igUserId, ig_username: me.username, fb_user_id: null,
    access_token: token, healthy: true, cooldown_until: null, last_error: null, owned: true,
    api_host: "instagram", token_expires_at: expires, scopes: Array.isArray(t1.permissions) ? t1.permissions.join(",") : String(t1.permissions || ""),
  }, { onConflict: "ig_user_id" });
  if (error) return fail(req, "Could not save the connection: " + error.message);
  // link to the creator's print so insights land on their page; queue a print if we've never seen them
  const { data: creator } = await admin.from("creators").select("id").eq("platform", "instagram").ilike("handle", me.username).maybeSingle();
  if (!creator) await admin.from("scan_jobs").insert({ user_id: user.id, platform: "instagram", handle: String(me.username).toLowerCase(), priority: 1, source: "watch" });
  track(user.id, "instagram_connected", { username: me.username, via: "instagram_login", followers: me.followers_count || null });
  const res = NextResponse.redirect(redirectTo(req, `${nextOf(req)}?ig=ok`));
  res.cookies.delete("cl_ig_state");
  return res;
}
