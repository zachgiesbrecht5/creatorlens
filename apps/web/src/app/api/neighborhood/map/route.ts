import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

// The lane's map for a neighborhood: every brand that paid the neighbors, month by
// month, with the seed creator's own brands flagged. Brands the seed hasn't worked
// with come first: that's the opportunity list, drawn as a timeline.
export async function GET(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  const admin = supabaseAdmin();
  const { data: n } = await admin.from("neighborhoods").select("user_id,candidates,creator_id,roster_creator_id").eq("id", id).single();
  if (!n || (n.user_id !== profile.id && profile.plan !== "admin")) return NextResponse.json({ items: [] });
  const cands = ((n.candidates || []) as any[]).filter((c) => c?.handle);
  if (!cands.length) return NextResponse.json({ items: [] });

  // seed creator (to flag brands they already have)
  let seedId: string | null = n.creator_id || null; let seedName = "your creator";
  if (!seedId && n.roster_creator_id) {
    const { data: rc } = await admin.from("roster_creators").select("name,handle,platform").eq("id", n.roster_creator_id).single();
    if (rc) { seedName = rc.name; const { data: c } = await admin.from("creators").select("id").eq("platform", rc.platform === "youtube" ? "youtube" : "instagram").ilike("handle", String(rc.handle || "").replace(/^@/, "")).maybeSingle(); seedId = c?.id || null; }
  } else if (seedId) { const { data: c } = await admin.from("creators").select("display_name,handle").eq("id", seedId).single(); seedName = c?.display_name || c?.handle || seedName; }
  const { data: seedWall } = seedId ? await admin.from("brand_wall").select("brand_id").eq("creator_id", seedId) : { data: [] };
  const seedBrands = new Set((seedWall || []).map((w) => w.brand_id));

  // neighbor creators in the index
  const { data: creators } = await admin.from("creators").select("id,handle,platform,display_name").or(cands.map((c) => `handle.ilike.${String(c.handle).replace(/^@/, "")}`).join(","));
  const ids = (creators || []).filter((c) => cands.some((x) => x.platform === c.platform && String(x.handle).replace(/^@/, "").toLowerCase() === String(c.handle).toLowerCase())).map((c) => c.id);
  if (!ids.length) return NextResponse.json({ items: [], seedName });
  const nameOf = new Map((creators || []).map((c) => [c.id, c.display_name || c.handle]));
  const [{ data: wall }, { data: parts }] = await Promise.all([
    admin.from("brand_wall").select("creator_id,brand_id,brand,category,deals,repeat_partner").in("creator_id", ids).eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false).neq("best_label", "Low"),
    admin.from("partnerships").select("creator_id,brand_id,published_at").in("creator_id", ids).neq("status", "rejected").not("published_at", "is", null).limit(3000),
  ]);
  const agg = new Map<string, { brand_id: string; brand: string; category: string | null; months: Set<string>; deals: number; repeat: boolean; who: Set<string> }>();
  for (const w of wall || []) {
    const e = agg.get(w.brand_id) || agg.set(w.brand_id, { brand_id: w.brand_id, brand: w.brand, category: w.category, months: new Set(), deals: 0, repeat: false, who: new Set() }).get(w.brand_id)!;
    e.deals += Number(w.deals) || 0; e.repeat = e.repeat || !!w.repeat_partner; e.who.add(nameOf.get(w.creator_id) || "");
  }
  for (const p of parts || []) { const e = agg.get(p.brand_id); if (e) e.months.add(String(p.published_at).slice(0, 7)); }
  const items = [...agg.values()].map((e) => {
    const has = seedBrands.has(e.brand_id);
    const who = [...e.who].filter(Boolean).slice(0, 3).join(", ");
    return { brand_id: e.brand_id, brand: e.brand, category: e.category, months: [...e.months].sort(), deals: e.deals, repeat: e.repeat, season: has ? "already pays " + seedName : "not " + seedName + " yet", why: `Pays ${who}.${has ? ` Also pays ${seedName}.` : ` Hasn't paid ${seedName}: pitch them.`}`, has };
  }).sort((a, b) => Number(a.has) - Number(b.has) || b.months.length - a.months.length);
  return NextResponse.json({ items, seedName, missing: items.filter((i) => !i.has).length });
}
