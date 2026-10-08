import { NextResponse, type NextRequest } from "next/server";
import { portalViewer } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { track } from "@/lib/track";

// Thumbs on a brief suggestion. Down hides it for this creator (the list refills); up also files it as an idea
// to test. Either way the manager sees it on the creator page and the From-your-creators strip.
export async function POST(req: NextRequest) {
  const ctx = await portalViewer(); if (!ctx || !ctx.enabled) return NextResponse.json({ error: "Not available" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const kind = b.kind === "gap" ? "gap" : "opener"; const key = String(b.key || "").slice(0, 200); const vote = Number(b.vote) === 1 ? 1 : -1;
  if (!key) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const admin = supabaseAdmin();
  await admin.from("brief_feedback").upsert({ roster_creator_id: ctx.roster.id, kind, key, vote, label: b.label ? String(b.label).slice(0, 200) : null }, { onConflict: "roster_creator_id,kind,key" });
  if (vote === 1 && b.label) {
    const idea = kind === "opener" ? `Try an opening like "${b.label}"${b.example ? ` (as in "${String(b.example).slice(0, 80)}")` : ""}` : `Film something about ${b.label}`;
    const { data: dup } = await admin.from("experiments").select("id").eq("roster_creator_id", ctx.roster.id).eq("idea", idea).maybeSingle();
    if (!dup) await admin.from("experiments").insert({ roster_creator_id: ctx.roster.id, idea, hook: kind === "opener" ? String(b.label).slice(0, 200) : null, why: b.why ? String(b.why).slice(0, 300) : null, post_url: b.example_url || null, suggested_by: "creator", status: "idea" });
  }
  track(ctx.roster.user_id, vote === 1 ? "brief_thumbs_up" : "brief_thumbs_down", { roster_creator_id: ctx.roster.id, creator: ctx.roster.name, kind, key, label: b.label || null });
  return NextResponse.json({ ok: true });
}
