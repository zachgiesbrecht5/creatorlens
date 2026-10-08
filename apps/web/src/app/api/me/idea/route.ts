import { NextResponse, type NextRequest } from "next/server";
import { portalViewer } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { track } from "@/lib/track";

// A creator saves a lane post as an idea to test. Lands in experiments (suggested_by=creator), which the
// manager sees on the creator's page under "worth testing" and the creator sees on their home.
export async function POST(req: NextRequest) {
  const ctx = await portalViewer(); if (!ctx || !ctx.enabled) return NextResponse.json({ error: "Not available" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const idea = String(b.idea || "").trim().slice(0, 500);
  if (!idea) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: dup } = b.post_url ? await admin.from("experiments").select("id").eq("roster_creator_id", ctx.roster.id).eq("post_url", String(b.post_url)).maybeSingle() : { data: null };
  if (dup) return NextResponse.json({ ok: true, id: dup.id, already: true });
  const { data, error } = await admin.from("experiments").insert({ roster_creator_id: ctx.roster.id, idea, hook: b.hook ? String(b.hook).slice(0, 200) : null, why: b.why ? String(b.why).slice(0, 300) : null, post_url: b.post_url ? String(b.post_url) : null, suggested_by: "creator", status: "idea" }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  track(ctx.roster.user_id, "creator_saved_idea", { roster_creator_id: ctx.roster.id, creator: ctx.roster.name, idea: idea.slice(0, 120), post_url: b.post_url || null });
  return NextResponse.json({ ok: true, id: data.id });
}
