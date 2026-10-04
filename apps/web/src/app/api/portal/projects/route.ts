import { NextResponse, type NextRequest } from "next/server";
import { ownRoster } from "@/lib/portal-admin";
import { supabaseAdmin } from "@/lib/supabase";
// POST { rosterCreatorId, id?, ...fields } create/update; DELETE { id }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const ctx = await ownRoster(b.rosterCreatorId); if (!ctx) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const admin = supabaseAdmin();
  const fields: any = {}; for (const k of ["brand", "title", "deliverables", "status", "due_at", "go_live_at", "fee", "currency", "invoice_sent_at", "paid_at", "notes", "visible"]) if (b[k] !== undefined) fields[k] = b[k] === "" ? null : b[k];
  if (b.id) { const { data, error } = await admin.from("projects").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", b.id).eq("roster_creator_id", ctx.roster.id).select("*").single(); if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json(data); }
  if (!fields.brand) return NextResponse.json({ error: "Brand is required" }, { status: 400 });
  const { data: brand } = await admin.from("brands").select("id").ilike("name", fields.brand).limit(1).maybeSingle();
  const { data, error } = await admin.from("projects").insert({ ...fields, user_id: ctx.roster.user_id, roster_creator_id: ctx.roster.id, brand_id: brand?.id || null }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json(data);
}
export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const ctx = await ownRoster(b.rosterCreatorId); if (!ctx) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  await supabaseAdmin().from("projects").delete().eq("id", b.id).eq("roster_creator_id", ctx.roster.id);
  return NextResponse.json({ ok: true });
}
