import { NextResponse } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

// Admin: POST { id, action: "apply" | "dismiss" } resolves a flagged deal.
export async function POST(req: Request) {
  const profile = await currentProfile();
  if (profile?.plan !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { id, action } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: c } = await admin.from("corrections").select("*").eq("id", id).single();
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (action === "apply") {
    if (c.scope === "brand") {
      await admin.from("brands").update({ is_junk: true }).eq("id", c.brand_id);
      await admin.from("partnerships").update({ status: "rejected" }).eq("brand_id", c.brand_id);
    } else {
      await admin.from("partnerships").update({ status: "rejected" }).eq("brand_id", c.brand_id).eq("creator_id", c.creator_id);
    }
    const { data: agg } = await admin.from("partnerships").select("creator_id").eq("brand_id", c.brand_id).neq("status", "rejected");
    await admin.from("brands").update({ deal_count: agg?.length ?? 0, creator_count: new Set((agg || []).map((a) => a.creator_id)).size }).eq("id", c.brand_id);
    // same flag from anyone else is settled too
    await admin.from("corrections").update({ status: "applied" }).eq("brand_id", c.brand_id).eq("status", "open").or(c.scope === "brand" ? "scope.eq.brand,scope.eq.pair" : `creator_id.eq.${c.creator_id}`);
  } else {
    await admin.from("corrections").update({ status: "dismissed" }).eq("id", id);
  }
  return NextResponse.json({ ok: true });
}
