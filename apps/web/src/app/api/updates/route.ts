import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { googleAccessToken, createGmailDraft, bodyToHtml } from "@/lib/gmail";
import { pulseHtml } from "@/lib/pulse-html";
import { pulseStats } from "@/lib/pulse-stats";

// PATCH { id, body?, subject?, action: "save" | "approve" | "send" | "skip" }
export async function PATCH(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id, body, subject, action } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: u } = await admin.from("creator_updates").select("*, roster_creators(name,creator_email)").eq("id", id).single();
  if (!u || u.user_id !== profile.id) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const patch: any = {};
  if (body !== undefined) patch.body = String(body);
  if (subject !== undefined) patch.subject = String(subject);
  if (action === "skip") patch.status = "skipped";
  if (action === "approve") patch.status = "approved";
  if (action === "send") {
    const to = (u as any).roster_creators?.creator_email;
    if (!to) return NextResponse.json({ error: "Add the creator's email on My creators first" }, { status: 400 });
    const { data: gc } = await admin.from("google_connections").select("refresh_token").eq("user_id", profile.id).maybeSingle();
    if (!gc?.refresh_token) return NextResponse.json({ error: "Connect Gmail in Settings to send updates" }, { status: 400 });
    const token = await googleAccessToken(gc.refresh_token);
    const text = (body ?? u.body) + "\n\n";
    const kind = ((u as any).kind || "monthly") as "weekly" | "monthly";
    const stats = await pulseStats(u.roster_creator_id, profile.id);
    const dateLabel = kind === "weekly" ? `Week of ${new Date(u.month + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}` : new Date(u.month + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const html = pulseHtml({ body: body ?? u.body, creatorFirst: String((u as any).roster_creators?.name || "there").split(" ")[0], dateLabel, kind, stats, signatureHtml: profile.signature_html || null });
    const d = await createGmailDraft(token, { to, subject: subject ?? u.subject, body: text, html });
    // send the draft
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ id: d.id }) });
    if (!r.ok) return NextResponse.json({ error: `Gmail send failed: ${await r.text()}` }, { status: 502 });
    patch.status = "sent"; patch.sent_at = new Date().toISOString(); patch.gmail_draft_id = d.id;
  }
  await admin.from("creator_updates").update(patch).eq("id", id);
  return NextResponse.json({ ok: true, status: patch.status || u.status });
}

// POST { rosterCreatorId, monthly_update?, creator_email?, update_show_money?, update_show_early? } -> settings
export async function POST(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const j = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: rc } = await admin.from("roster_creators").select("id,user_id").eq("id", j.rosterCreatorId).single();
  if (!rc || rc.user_id !== profile.id) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const patch: any = {};
  for (const k of ["monthly_update", "creator_email", "update_show_money", "update_show_early"]) if (j[k] !== undefined) patch[k] = j[k];
  await admin.from("roster_creators").update(patch).eq("id", rc.id);
  return NextResponse.json({ ok: true });
}
