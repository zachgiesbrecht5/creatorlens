import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

// POST { id, action: "approve" | "dismiss", edits?: {...} }  |  POST { watch: true|false }
export async function POST(req: NextRequest) {
  const profile = await currentProfile(); if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  if (b.watch !== undefined) { await admin.from("profiles").update({ inbox_watch: !!b.watch, inbox_note: b.watch ? "Checking within the hour" : null, inbox_watched_at: null }).eq("id", profile.id); return NextResponse.json({ ok: true }); }
  const { data: it } = await admin.from("inbox_items").select("*").eq("id", b.id).eq("user_id", profile.id).single();
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.action === "dismiss") { await admin.from("inbox_items").update({ status: "dismissed" }).eq("id", it.id); return NextResponse.json({ ok: true }); }
  const f = { ...(it.payload || {}), ...(b.edits || {}) };
  const rosterId = b.edits?.roster_creator_id || it.roster_creator_id;
  if (!rosterId) return NextResponse.json({ error: "Pick which creator this is for" }, { status: 400 });
  const { data: r } = await admin.from("roster_creators").select("id,user_id").eq("id", rosterId).single();
  if (!r || r.user_id !== profile.id) return NextResponse.json({ error: "Not your creator" }, { status: 403 });
  const brand = String(f.brand || it.brand || "").trim();
  let projectId: string | null = null, eventId: string | null = null;
  if (it.kind === "event") {
    const { data: ev } = await admin.from("creator_events").insert({ user_id: profile.id, roster_creator_id: r.id, title: f.title || it.subject || "Event", starts_at: f.starts_at || new Date().toISOString(), location: f.location || null, brand: brand || null, details: f.summary || null, rsvp_url: f.rsvp_url || null, source: "inbox" }).select("id").single();
    eventId = ev?.id || null;
  } else {
    // project / project_update / payout: find an existing project for this brand, else create
    const { data: existing } = brand ? await admin.from("projects").select("id,status").eq("roster_creator_id", r.id).ilike("brand", brand).not("status", "in", "(paid,cancelled)").order("created_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
    const patch: any = {};
    if (f.deliverables) patch.deliverables = f.deliverables; if (f.title) patch.title = f.title;
    if (f.due_at) patch.due_at = f.due_at; if (f.go_live_at) patch.go_live_at = f.go_live_at;
    if (f.fee != null && f.fee !== "") patch.fee = Number(f.fee); if (f.amount != null && f.amount !== "") patch.fee = Number(f.amount);
    if (it.kind === "payout") { if (f.status === "paid") { patch.status = "paid"; patch.paid_at = f.when || new Date().toISOString().slice(0, 10); } else { patch.status = "invoiced"; patch.invoice_sent_at = f.when || new Date().toISOString().slice(0, 10); } }
    if (it.kind === "project_update" && f.status) patch.status = f.status;
    patch.notes = [existing ? null : null, f.summary].filter(Boolean).join(" ");
    if (existing) { await admin.from("projects").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", existing.id); projectId = existing.id; }
    else {
      if (!brand) return NextResponse.json({ error: "Brand is required" }, { status: 400 });
      const { data: bid } = await admin.from("brands").select("id").ilike("name", brand).limit(1).maybeSingle();
      const { data: p } = await admin.from("projects").insert({ user_id: profile.id, roster_creator_id: r.id, brand, brand_id: bid?.id || null, status: patch.status || "confirmed", ...patch, source: "inbox", source_ref: it.thread_id }).select("id").single();
      projectId = p?.id || null;
    }
  }
  await admin.from("inbox_items").update({ status: "approved", roster_creator_id: r.id, applied_project_id: projectId, applied_event_id: eventId, payload: f }).eq("id", it.id);
  return NextResponse.json({ ok: true, projectId, eventId });
}
