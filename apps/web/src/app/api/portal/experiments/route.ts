import { NextResponse, type NextRequest } from "next/server";
import { ownRoster } from "@/lib/portal-admin";
import { supabaseAdmin } from "@/lib/supabase";
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const ctx = await ownRoster(b.rosterCreatorId); if (!ctx) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const admin = supabaseAdmin();
  if (b.id) { const patch: any = { updated_at: new Date().toISOString() }; for (const k of ["status", "result", "post_url", "metric", "idea", "hook", "why"]) if (b[k] !== undefined) patch[k] = b[k]; const { data, error } = await admin.from("experiments").update(patch).eq("id", b.id).eq("roster_creator_id", ctx.roster.id).select("*").single(); if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json(data); }
  if (!String(b.idea || "").trim()) return NextResponse.json({ error: "Describe the idea" }, { status: 400 });
  const { data, error } = await admin.from("experiments").insert({ roster_creator_id: ctx.roster.id, idea: String(b.idea).slice(0, 500), hook: b.hook || null, why: b.why || null, suggested_by: "manager" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json(data);
}
