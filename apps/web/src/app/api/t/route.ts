import { NextResponse } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

// First-party pageview beacon. No third-party analytics, no cookies beyond a random id
// the browser keeps. Bots and our own admin traffic are skipped.
const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget/i;

export async function POST(req: Request) {
  const ua = req.headers.get("user-agent") || "";
  if (BOT.test(ua)) return new NextResponse(null, { status: 204 });
  const { a, p, r } = await req.json().catch(() => ({}));
  if (typeof a !== "string" || typeof p !== "string" || a.length > 64 || p.length > 300) return new NextResponse(null, { status: 204 });
  const profile = await currentProfile().catch(() => null);
  if (profile?.plan === "admin") return new NextResponse(null, { status: 204 });
  let referrer: string | null = null;
  try { if (typeof r === "string" && r) { const u = new URL(r); if (!u.hostname.endsWith("sponsorprint.com")) referrer = u.hostname; } } catch {}
  await supabaseAdmin().from("pageviews").insert({ anon_id: a, user_id: profile?.id || null, path: p.split("?")[0], referrer });
  return new NextResponse(null, { status: 204 });
}
