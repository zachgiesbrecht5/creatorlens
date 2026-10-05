import { NextResponse, type NextRequest } from "next/server";
import { profileFromKey } from "@/lib/api-key";
import { supabaseAdmin } from "@/lib/supabase";
import { trackerStatuses } from "@/lib/tracker";
import { laneLaunches } from "@/lib/launches";

// GET /api/v1/leads?creator=<handle or roster name>&limit=40&include_pitched=0
// Brands paying creators in this creator's lane that have NOT paid this creator, ranked by how
// many lane creators they pay, with proof creators, contacts on file, tracker status (pitched /
// excluded / clean), and any live launch window. This is the outreach list.
export async function GET(req: NextRequest) {
  const profile = await profileFromKey(req); if (!profile) return NextResponse.json({ error: "Missing or invalid API key" }, { status: 401 });
  const q = req.nextUrl.searchParams; const who = String(q.get("creator") || "").trim().replace(/^@/, "").toLowerCase();
  const limit = Math.min(100, Number(q.get("limit") || 40)); const includePitched = q.get("include_pitched") === "1";
  if (!who) return NextResponse.json({ error: "creator is required (handle or roster name)" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: rosterRows } = await admin.from("roster_creators").select("id,name,handle,platform").eq("user_id", profile.id);
  const r = (rosterRows || []).find((x) => String(x.handle || "").replace(/^@/, "").toLowerCase() === who || x.name.toLowerCase() === who || x.name.toLowerCase().split(" ")[0] === who);
  const platform = r ? (r.platform === "youtube" ? "youtube" : "instagram") : (q.get("platform") || "instagram");
  const handle = r ? String(r.handle || "").replace(/^@/, "").toLowerCase() : who;
  const { data: me } = await admin.from("creators").select("id,category,display_name,followers").eq("platform", platform).ilike("handle", handle).maybeSingle();
  if (!me?.category) return NextResponse.json({ error: `Creator @${handle} isn't printed yet or has no lane; print them on sponsorprint.com first`, creator: handle }, { status: 404 });
  const { data: mineWall } = await admin.from("brand_wall").select("brand_id").eq("creator_id", me.id);
  const mine = new Set((mineWall || []).map((w) => w.brand_id));
  const { data: lane } = await admin.from("brand_wall").select("brand_id,brand,category,website,creator_id,deals,last_seen,creators!inner(category,display_name,handle,followers)").eq("creators.category", me.category).eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false).neq("best_label", "Low").limit(6000);
  const agg = new Map<string, any>();
  for (const w of (lane || []) as any[]) { if (mine.has(w.brand_id) || w.creator_id === me.id) continue; const e = agg.get(w.brand_id) || agg.set(w.brand_id, { brand_id: w.brand_id, brand: w.brand, category: w.category, website: w.website, deals: 0, last_seen: null, creators: new Map() }).get(w.brand_id); e.deals += Number(w.deals || 0); if (!e.last_seen || w.last_seen > e.last_seen) e.last_seen = w.last_seen; e.creators.set(w.creator_id, { name: w.creators.display_name || w.creators.handle, handle: w.creators.handle, followers: w.creators.followers }); }
  let list = [...agg.values()].map((e) => ({ ...e, lane_creators: e.creators.size, proof: [...e.creators.values()].slice(0, 4), creators: undefined })).sort((a, b) => b.lane_creators - a.lane_creators || b.deals - a.deals).slice(0, 300);
  const ids = list.map((b) => b.brand_id);
  const [{ data: contacts }, tracker, launches] = await Promise.all([
    ids.length ? admin.from("contacts").select("brand_id,name,title,email,source").in("brand_id", ids).eq("house_only", false) : Promise.resolve({ data: [] as any[] }),
    trackerStatuses(profile.id, list.map((b) => ({ id: b.brand_id, name: b.brand, website: b.website }))),
    laneLaunches(me.category),
  ]);
  const byBrand = new Map<string, any[]>(); for (const c of contacts || []) (byBrand.get(c.brand_id) || byBrand.set(c.brand_id, []).get(c.brand_id)!).push({ name: c.name, title: c.title, email: c.email, source: c.source });
  const launchBy = new Map(launches.map((l) => [l.brand_id, l]));
  list = list.map((b) => { const t = tracker[b.brand_id]; const l = launchBy.get(b.brand_id); return { ...b, tracker: t ? { state: t.state, label: t.label, detail: t.detail || null } : null, contacts: byBrand.get(b.brand_id) || [], launch: l ? { kind: l.kind, product: l.product, posted_at: l.posted_at, window: l.status, window_start: l.window_start, window_end: l.window_end, said: l.spoken || l.on_video || null, url: l.url } : null }; });
  if (!includePitched) list = list.filter((b) => !b.tracker || b.tracker.state === "clean" || b.tracker.state === "old");
  return NextResponse.json({ creator: { handle, name: r?.name || me.display_name, platform, lane: me.category, followers: me.followers }, count: list.length, leads: list.slice(0, limit).map((b) => ({ brand: b.brand, website: b.website, category: b.category, lane_creators: b.lane_creators, deals_in_lane: b.deals, last_seen: b.last_seen, proof: b.proof, contacts: b.contacts, tracker: b.tracker, launch: b.launch, brand_url: `https://sponsorprint.com/brands/${b.brand_id}` })) });
}
