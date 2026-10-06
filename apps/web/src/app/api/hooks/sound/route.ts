import { NextResponse, type NextRequest } from "next/server";
import { currentAccess, supabaseAdmin } from "@/lib/supabase";

const soundKey = (t: string) => String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");

// POST { creatorId, url } -> this top post's transcript is a trending sound, not the creator.
// House only. Fixes the card now and teaches the worker the line for every future print.
export async function POST(req: NextRequest) {
  const { profile, insider } = await currentAccess();
  if (!profile || !insider) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { creatorId, url, undo } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: c } = await admin.from("creators").select("performance").eq("id", creatorId).single();
  const perf = c?.performance as any; if (!perf?.top) return NextResponse.json({ error: "No print" }, { status: 404 });
  const t = (perf.top as any[]).find((x) => x.url === url); if (!t) return NextResponse.json({ error: "Post not in the print" }, { status: 404 });
  const line = t.lyrics || t.spoken || "";
  const key = soundKey(line);
  if (undo) { t.audio = "voice"; t.spoken = line; t.lyrics = null; if (key) await admin.from("known_sounds").delete().eq("key", key); }
  else { t.audio = "sound"; t.lyrics = line; t.spoken = ""; if (key.split(" ").length >= 3) await admin.from("known_sounds").upsert({ key, text: line.slice(0, 240), marked_by: profile.id }, { onConflict: "key" }); }
  await admin.from("creators").update({ performance: perf }).eq("id", creatorId);
  return NextResponse.json({ ok: true, audio: t.audio });
}
