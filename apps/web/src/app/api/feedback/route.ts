import { NextResponse } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { track, alert } from "@/lib/track";

// POST { mood?, kind?, body?, path?, email? } from the feedback widget.
export async function POST(req: Request) {
  const profile = await currentProfile().catch(() => null);
  const { mood, kind, body, path, email } = await req.json().catch(() => ({}));
  const text = typeof body === "string" ? body.trim().slice(0, 4000) : "";
  const m = ["love", "ok", "stuck"].includes(mood) ? mood : null;
  const k = kind === "question" ? "question" : "feedback";
  if (!m && !text) return NextResponse.json({ error: "Say something first" }, { status: 400 });
  const replyTo = profile?.email || (typeof email === "string" && /.+@.+\..+/.test(email) ? email.slice(0, 200) : null);
  if (k === "question" && !replyTo) return NextResponse.json({ error: "Add an email so we can answer" }, { status: 400 });
  const { error } = await supabaseAdmin().from("feedback").insert({ user_id: profile?.id || null, email: replyTo, path: typeof path === "string" ? path.slice(0, 300) : null, mood: m, kind: k, body: text || null });
  if (error) return NextResponse.json({ error: "Couldn't save that, try again" }, { status: 500 });
  if (profile) track(profile.id, "feedback", { mood: m, kind: k });
  // Questions and "stuck" reports ping the alert channel so someone answers fast.
  if (k === "question" || m === "stuck") alert(k === "question" ? "user question" : "user stuck", { from: replyTo, path, body: text.slice(0, 500) });
  return NextResponse.json({ ok: true });
}
