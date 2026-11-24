import { NextResponse, type NextRequest } from "next/server";
import { currentAccess, supabaseAdmin, canSeeCreator } from "@/lib/supabase";
import { renderPrint, laneRead, sane } from "@/lib/print-pdf";

// Lanes that share brands. Used only to widen a lane that is too small to produce a pitch list.
const LANE_GROUPS: string[][] = [["Health", "Wellness", "Fitness", "Food"], ["Fashion", "Beauty", "Lifestyle"], ["Tech", "Gaming"], ["Home", "DIY", "Design"], ["Parenting", "Dad", "Baby"], ["Outdoors", "Travel", "Sports"], ["Business", "Finance", "Legal", "Education"], ["Art", "Photography", "Books", "Entertainment"]];

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform") || "youtube";
  const handle = req.nextUrl.searchParams.get("handle") || "";
  const { profile, admin: seesAll, insider } = await currentAccess();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: c } = await admin.from("creators").select("id,platform,handle,display_name,followers,category,last_scanned_at,performance,bio,avatar_thumb").eq("platform", platform).ilike("handle", handle).maybeSingle();
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canSeeCreator(profile.id, seesAll, c))) return NextResponse.json({ error: "Unlock this print first" }, { status: 403 });
  const [{ data: wall }, { data: months }] = await Promise.all([
    admin.from("brand_wall_mv").select("brand_id,brand,category,deals,first_seen,last_seen,repeat_partner,content_url,best_label").eq("creator_id", c.id).eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false).order("last_seen", { ascending: false }),
    admin.from("partnerships").select("brand_id,published_at").eq("creator_id", c.id).neq("status", "rejected").not("published_at", "is", null).limit(2000),
  ]);
  // who the print is from: the signed-in manager, their org, and their sign-off phrase from Settings
  const { data: org } = profile.org_id ? await admin.from("orgs").select("name").eq("id", profile.org_id).maybeSingle() : { data: null };
  const by = { name: profile.full_name, org: org?.name, signoff: profile.signature };
  // what the lane is doing that this creator isn't: brands to pitch and category gaps. Brand names and
  // lane-wide shares go to everyone; per-brand creator counts stay with the house.
  let lane = null;
  if (c.category) {
    const mineRows = (wall || []).filter((w) => w.best_label !== "Low");
    const mine = new Set((wall || []).map((w) => w.brand_id)), myCats = new Set(mineRows.map((w) => w.category).filter(Boolean));
    const since = new Date(Date.now() - 365 * 864e5).toISOString();
    const laneFor = async (cats: string[]) => (await admin.from("brand_wall_mv").select("brand_id,brand,category,creator_id,deals,last_seen,creators!partnerships_creator_id_fkey!inner(category)").in("creators.category", cats).eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false).neq("best_label", "Low").limit(8000)).data || [];
    let read = laneRead(await laneFor([c.category]), c.id, mine, myCats, since);
    // A small lane (Health has a dozen creators) finds no brand that books two of them. Widen to the
    // neighbouring lanes and let brands from those categories through, so the pitch list isn't empty.
    const group = LANE_GROUPS.find((g) => g.includes(c.category));
    if ((read?.leads.length || 0) < 4 && group) {
      const wide = laneRead(await laneFor(group), c.id, mine, myCats, since, new Set([...myCats, ...group]));
      if (wide && wide.leads.length > (read?.leads.length || 0)) read = { ...wide, wide: true };
    }
    lane = read ? { ...read, counts: insider || seesAll } : null;
  }
  // default is the two-page version built for a first email; ?full=1 adds the evidence pages
  const full = req.nextUrl.searchParams.get("full") === "1";
  const bytes = await renderPrint({ c, platform, wall: wall || [], months: months || [], by, lane, full });
  const name = sane(c.display_name || `@${c.handle}`);
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name.replace(/[^A-Za-z0-9]+/g, "-") || "print"}-${String(org?.name || "sponsorprint").replace(/[^A-Za-z0-9]+/g, "-")}.pdf"` } });
}

