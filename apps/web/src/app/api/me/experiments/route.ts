import { NextResponse, type NextRequest } from "next/server";
import { creatorContext } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
// Creators log their own experiments and update results; managers can too (portal API).
export async function POST(req: NextRequest) {
  const ctx = await creatorContext(); if (!ctx || !ctx.enabled) return NextResponse.json({ error: "Not available" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  if (b.id) {
    const patch: any = { updated_at: new Date().toISOString() };
    for (const k of ["status", "result", "post_url", "metric"]) if (b[k] !== undefined) patch[k] = b[k];
    const { data, error } = await admin.from("experiments").update(patch).eq("id", b.id).eq("roster_creator_id", ctx.roster.id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json(data);
  }
  if (!String(b.idea || "").trim()) return NextResponse.json({ error: "Describe the idea" }, { status: 400 });
  const { data, error } = await admin.from("experiments").insert({ roster_creator_id: ctx.roster.id, idea: String(b.idea).slice(0, 500), hook: b.hook || null, why: b.why || null, status: "idea", suggested_by: "creator" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json(data);
}
