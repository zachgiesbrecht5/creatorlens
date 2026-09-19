import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

// PATCH { id, stage?, deal_value?, note? } on an outreach_log row you own (or your org's for team/agency).
export async function PATCH(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id, stage, deal_value, note } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: row } = await admin.from("outreach_log").select("id,user_id,org_id").eq("id", id).single();
  if (!row || (row.user_id !== profile.id && !(profile.org_id && row.org_id === profile.org_id) && profile.plan !== "admin")) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const patch: any = { updated_at: new Date().toISOString() };
  if (stage && ["pitched", "replied", "negotiating", "closed", "dead"].includes(stage)) { patch.stage = stage; if (stage === "replied" || stage === "negotiating") patch.replied_at = patch.replied_at || new Date().toISOString(); }
  if (deal_value !== undefined) patch.deal_value = deal_value === null || deal_value === "" ? null : Number(deal_value);
  if (note !== undefined) patch.note = String(note).slice(0, 500);
  await admin.from("outreach_log").update(patch).eq("id", id);
  return NextResponse.json({ ok: true });
}
