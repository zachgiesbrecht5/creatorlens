import { NextResponse, type NextRequest } from "next/server";
import { ownRoster } from "@/lib/portal-admin";
import { supabaseAdmin } from "@/lib/supabase";
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const ctx = await ownRoster(b.rosterCreatorId); if (!ctx) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const admin = supabaseAdmin();
  if (b.id) { const patch: any = { updated_at: new Date().toISOString() }; for (const k of ["status", "reply"]) if (b[k] !== undefined) patch[k] = b[k]; const { data, error } = await admin.from("requests").update(patch).eq("id", b.id).eq("roster_creator_id", ctx.roster.id).select("*").single(); if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json(data); }
  const { data, error } = await admin.from("requests").insert({ roster_creator_id: ctx.roster.id, text: String(b.text || "").slice(0, 1000), created_by: "manager" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json(data);
}
