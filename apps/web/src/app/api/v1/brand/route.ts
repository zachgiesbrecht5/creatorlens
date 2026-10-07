import { NextResponse, type NextRequest } from "next/server";
import { profileFromKey } from "@/lib/api-key";
import { supabaseAdmin } from "@/lib/supabase";
import { trackerStatuses } from "@/lib/tracker";
// GET /api/v1/brand?name=<brand or domain> : who they've paid (with posts), contacts on file, tracker status, launches.
export async function GET(req: NextRequest) {
  const profile = await profileFromKey(req); if (!profile) return NextResponse.json({ error: "Missing or invalid API key" }, { status: 401 });
  const name = String(req.nextUrl.searchParams.get("name") || "").trim(); if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const admin = supabaseAdmin();
  const dom = name.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  let { data: b } = await admin.from("brands").select("id,name,website,category,deal_count,creator_count,last_seen,ig_handle").or(`name.ilike.${name},website.ilike.%${dom}%`).order("deal_count", { ascending: false }).limit(1).maybeSingle();
  if (!b) { const { data: fuzzy } = await admin.from("brands").select("id,name,website,category,deal_count,creator_count,last_seen,ig_handle").ilike("name", `%${name}%`).order("deal_count", { ascending: false }).limit(1).maybeSingle(); b = fuzzy; }
  const tracker = (await trackerStatuses(profile.id, [{ id: b?.id || "x", name, website: b?.website || null }]))[b?.id || "x"];
  if (!b) return NextResponse.json({ found: false, name, tracker: tracker ? { state: tracker.state, label: tracker.label, detail: tracker.detail || null } : null, note: "Not in the Sponsorprint index yet; no disclosed creator deals found for this name." });
  const [{ data: wall }, { data: contacts }, { data: launches }] = await Promise.all([
    admin.from("brand_wall_mv").select("creator_id,deals,last_seen,content_url,creators(display_name,handle,platform,followers,category)").eq("brand_id", b.id).eq("is_junk", false).eq("is_self_brand", false).neq("best_label", "Low").order("last_seen", { ascending: false }).limit(40),
    admin.from("contacts").select("name,title,email,source").eq("brand_id", b.id).eq("house_only", false),
    admin.from("launch_signals").select("kind,product,summary,posted_at,url,spoken,on_video,window_start,window_end").eq("brand_id", b.id).order("posted_at", { ascending: false }).limit(5),
  ]);
  return NextResponse.json({ found: true, brand: b.name, website: b.website, category: b.category, instagram: b.ig_handle, disclosed_deals: b.deal_count, creators_paid: b.creator_count, last_seen: b.last_seen, tracker: tracker ? { state: tracker.state, label: tracker.label, detail: tracker.detail || null } : null, paid_creators: ((wall || []) as any[]).map((w) => ({ name: w.creators?.display_name || w.creators?.handle, handle: w.creators?.handle, platform: w.creators?.platform, followers: w.creators?.followers, lane: w.creators?.category, deals: w.deals, last: w.last_seen, post: w.content_url })), contacts: contacts || [], launches: (launches || []).map((l) => ({ kind: l.kind, product: l.product, summary: l.summary, posted_at: l.posted_at, said: l.spoken || l.on_video || null, window_start: l.window_start, window_end: l.window_end, url: l.url })), brand_url: `https://sponsorprint.com/brands/${b.id}` });
}
