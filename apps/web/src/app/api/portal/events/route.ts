import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { ownRoster } from "@/lib/portal-admin";
// POST { rosterCreatorId|null, id?, title, starts_at, ends_at?, location?, brand?, details?, rsvp_url?, visible? }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const profile = await currentProfile(); if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (b.rosterCreatorId && !(await ownRoster(b.rosterCreatorId))) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const admin = supabaseAdmin();
  const fields: any = {}; for (const k of ["title", "starts_at", "ends_at", "location", "brand", "details", "rsvp_url", "visible"]) if (b[k] !== undefined) fields[k] = b[k] === "" ? null : b[k];
  if (b.id) { const { data, error } = await admin.from("creator_events").update(fields).eq("id", b.id).eq("user_id", profile.id).select("*").single(); if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json(data); }
  if (!fields.title || !fields.starts_at) return NextResponse.json({ error: "Title and date are required" }, { status: 400 });
  const { data, error } = await admin.from("creator_events").insert({ ...fields, user_id: profile.id, roster_creator_id: b.rosterCreatorId || null }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json(data);
}
export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const profile = await currentProfile(); if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await supabaseAdmin().from("creator_events").delete().eq("id", b.id).eq("user_id", profile.id);
  return NextResponse.json({ ok: true });
}
