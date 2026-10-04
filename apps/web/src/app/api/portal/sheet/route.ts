import { NextResponse, type NextRequest } from "next/server";
import { ownRoster } from "@/lib/portal-admin";
import { supabaseAdmin } from "@/lib/supabase";
// POST { rosterCreatorId, url } : link (or clear) this creator's project tracker sheet; synced hourly.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const ctx = await ownRoster(b.rosterCreatorId); if (!ctx) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const m = String(b.url || "").match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  const admin = supabaseAdmin();
  if (!b.url) { await admin.from("roster_creators").update({ project_sheet_id: null, project_sheet_note: null, project_sheet_synced_at: null }).eq("id", ctx.roster.id); return NextResponse.json({ ok: true, cleared: true }); }
  if (!m) return NextResponse.json({ error: "Paste the Google Sheet link" }, { status: 400 });
  await admin.from("roster_creators").update({ project_sheet_id: m[1], project_sheet_synced_at: null, project_sheet_note: "Syncing within 15 minutes" }).eq("id", ctx.roster.id);
  return NextResponse.json({ ok: true });
}
