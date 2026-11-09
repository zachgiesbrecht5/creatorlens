import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { titleLabAccess, LAB_FRESH_DAYS } from "@/lib/titlelab";

// GET ?creatorId= -> the lab's status (the page polls this while the worker runs)
export async function GET(req: NextRequest) {
  const creatorId = req.nextUrl.searchParams.get("creatorId") || "";
  const a = await titleLabAccess(creatorId);
  if (!a.creator || !a.view) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { data } = await supabaseAdmin().from("title_labs").select("status,error,items_n,finished_at,updated_at").eq("creator_id", creatorId).maybeSingle();
  return NextResponse.json(data || { status: "none" });
}

// POST { creatorId, force? } -> queue a run. Fresh labs (under 7 days) are returned as-is unless force.
export async function POST(req: NextRequest) {
  const { creatorId, force } = await req.json().catch(() => ({}));
  const a = await titleLabAccess(String(creatorId || ""));
  if (!a.creator || !a.view) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!a.run) return NextResponse.json({ error: "Running a Title Lab is on Pro and Agency plans." }, { status: 402 });
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("title_labs").select("status,finished_at").eq("creator_id", creatorId).maybeSingle();
  if (cur && (cur.status === "queued" || cur.status === "running")) return NextResponse.json({ ok: true, status: cur.status });
  if (cur?.status === "done" && !force && cur.finished_at && Date.now() - new Date(cur.finished_at).getTime() < LAB_FRESH_DAYS * 864e5) return NextResponse.json({ ok: true, status: "done", fresh: true });
  const { error } = await admin.from("title_labs").upsert({ creator_id: creatorId, status: "queued", requested_by: a.user!.id, error: null, updated_at: new Date().toISOString() }, { onConflict: "creator_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  admin.from("events").insert({ user_id: a.user!.id, name: "title_lab", props: { creator_id: creatorId, force: !!force } }).then(() => {}, () => {});
  return NextResponse.json({ ok: true, status: "queued" });
}
