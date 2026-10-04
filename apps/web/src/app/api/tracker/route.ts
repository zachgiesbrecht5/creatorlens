import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

// POST { url } : link the outreach tracker (a Google Sheet) to this account; the worker syncs it within 15 minutes.
export async function POST(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { url } = await req.json().catch(() => ({}));
  const m = String(url || "").match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/) || String(url || "").match(/^([A-Za-z0-9_-]{20,})$/);
  const admin = supabaseAdmin();
  if (!url) { await admin.from("profiles").update({ tracker_sheet_id: null, tracker_note: null, tracker_synced_at: null }).eq("id", profile.id); await admin.from("tracker_rows").delete().eq("user_id", profile.id); return NextResponse.json({ ok: true, cleared: true }); }
  if (!m) return NextResponse.json({ error: "Paste the Google Sheet link (docs.google.com/spreadsheets/d/…)" }, { status: 400 });
  await admin.from("profiles").update({ tracker_sheet_id: m[1], tracker_synced_at: null, tracker_note: "Syncing within 15 minutes" }).eq("id", profile.id);
  return NextResponse.json({ ok: true, id: m[1] });
}
