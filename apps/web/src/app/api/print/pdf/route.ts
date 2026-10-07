import { NextResponse, type NextRequest } from "next/server";
import { currentAccess, supabaseAdmin, canSeeCreator } from "@/lib/supabase";
import { renderPrint, sane } from "@/lib/print-pdf";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform") || "youtube";
  const handle = req.nextUrl.searchParams.get("handle") || "";
  const { profile, admin: seesAll } = await currentAccess();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: c } = await admin.from("creators").select("id,platform,handle,display_name,followers,category,last_scanned_at,performance,bio,avatar_thumb").eq("platform", platform).ilike("handle", handle).maybeSingle();
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canSeeCreator(profile.id, seesAll, c))) return NextResponse.json({ error: "Unlock this print first" }, { status: 403 });
  const [{ data: wall }, { data: recent }, { data: months }] = await Promise.all([
    admin.from("brand_wall_mv").select("brand_id,brand,category,deals,first_seen,last_seen,repeat_partner,content_url,best_label").eq("creator_id", c.id).eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false).order("last_seen", { ascending: false }),
    admin.from("partnerships").select("brand_id,content_url,content_title,published_at,brands(name)").eq("creator_id", c.id).neq("status", "rejected").not("content_url", "is", null).order("published_at", { ascending: false }).limit(8),
    admin.from("partnerships").select("brand_id,published_at").eq("creator_id", c.id).neq("status", "rejected").not("published_at", "is", null).limit(2000),
  ]);
  const bytes = await renderPrint({ c, platform, wall: wall || [], recent: recent || [], months: months || [] });
  const name = sane(c.display_name || `@${c.handle}`);
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name.replace(/[^A-Za-z0-9]+/g, "-") || "print"}-sponsorprint.pdf"` } });
}

