import { NextResponse, type NextRequest } from "next/server";
import { currentAccess, canSeeCreator, supabaseAdmin } from "@/lib/supabase";

// POST { brandId, creatorId, scope: "pair" | "brand" }
// pair  = this brand is not a sponsor of THIS creator (agency link, own merch, collab credit)
// brand = this name is never a sponsor for anyone (music library, agency, vendor)
export async function POST(req: NextRequest) {
  const { profile, insider, admin: seesAll } = await currentAccess();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { brandId, creatorId, scope, note } = await req.json().catch(() => ({}));
  if (!brandId || !creatorId) return NextResponse.json({ error: "brandId and creatorId required" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: cr } = await admin.from("creators").select("platform,handle,external_id").eq("id", creatorId).single();
  if (!cr || !(await canSeeCreator(profile.id, seesAll, cr))) return NextResponse.json({ error: "Not your creator" }, { status: 403 });
  if (!insider) {
    // Outsiders can't edit the shared index. Their flag hides the row for them now and
    // goes to the review queue; an admin applies it for everyone.
    await admin.from("partnership_hides").upsert({ user_id: profile.id, creator_id: creatorId, brand_id: brandId }, { onConflict: "user_id,creator_id,brand_id", ignoreDuplicates: true });
    await admin.from("corrections").upsert({ user_id: profile.id, creator_id: creatorId, brand_id: brandId, scope: scope === "brand" ? "brand" : "pair", note: typeof note === "string" ? note.slice(0, 500) : null }, { onConflict: "user_id,creator_id,brand_id,scope", ignoreDuplicates: true });
    return NextResponse.json({ ok: true, scope: "pair", reviewed: true, note: "Thanks. Hidden for you, and sent for review so it's fixed for everyone." });
  }
  await admin.from("partnerships").update({ status: "rejected" }).eq("brand_id", brandId).eq("creator_id", creatorId);
  if (scope === "brand") {
    await admin.from("brands").update({ is_junk: true }).eq("id", brandId);
    await admin.from("partnerships").update({ status: "rejected" }).eq("brand_id", brandId);
  }
  // refresh rollups so the leaderboard drops it
  const { data: agg } = await admin.from("partnerships").select("creator_id").eq("brand_id", brandId).neq("status", "rejected");
  await admin.from("brands").update({ deal_count: agg?.length ?? 0, creator_count: new Set((agg || []).map((a) => a.creator_id)).size }).eq("id", brandId);
  return NextResponse.json({ ok: true, scope: scope === "brand" ? "brand" : "pair" });
}
