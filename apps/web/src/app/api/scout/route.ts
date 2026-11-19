import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

// Scout board actions. Admins only.
//   { action: "status", id, status, note? }   move a candidate: new | shortlisted | contacted | dismissed
//   { action: "add_query", query, lane? }     add a search phrase for the scout to run
//   { action: "toggle_query", id, active }    pause or resume one
//   { action: "delete_query", id }
const STATUSES = new Set(["new", "shortlisted", "contacted", "dismissed"]);
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);

export async function POST(req: NextRequest) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (me.plan !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  if (body.action === "status") {
    const id = uuid(body.id); const status = String(body.status || "");
    if (!id || !STATUSES.has(status)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (typeof body.note === "string") patch.note = body.note.trim().slice(0, 500) || null;
    const { error } = await admin.from("scout_candidates").update(patch).eq("id", id);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (body.action === "add_query") {
    const query = String(body.query || "").replace(/["#]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
    const lane = String(body.lane || "").replace(/\s+/g, " ").trim().slice(0, 40) || null;
    if (query.length < 3) return NextResponse.json({ error: "Type a search phrase, like \"budget PC build guide\"" }, { status: 400 });
    const { count } = await admin.from("scout_queries").select("id", { count: "exact", head: true });
    if ((count || 0) >= 60) return NextResponse.json({ error: "60 searches is the limit. Remove one first." }, { status: 400 });
    const { error } = await admin.from("scout_queries").insert({ query, lane, created_by: me.id });
    if (error) return NextResponse.json({ error: /duplicate/i.test(error.message) ? "That search is already on the list" : error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "toggle_query") {
    const id = uuid(body.id); if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    await admin.from("scout_queries").update({ active: body.active === true }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "delete_query") {
    const id = uuid(body.id); if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    await admin.from("scout_queries").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
