import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { salesNavAdmin } from "@/lib/salesnav";

// Bulk actions from the /salesnav tab. Admin session only.
// { table: "people" | "accounts", ids: string[], action: "find_email" | "enrich" | "target" | "pitched" | "skip" | "new" | "delete" }
const STATUS = new Set(["target", "pitched", "skip", "new"]);

export async function POST(req: NextRequest) {
  const a = await salesNavAdmin(req);
  if (!a.profile) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const body = await req.json().catch(() => null);
  const table = body?.table === "accounts" ? "salesnav_accounts" : body?.table === "people" ? "salesnav_people" : null;
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 500) : [];
  const action = String(body?.action || "");
  if (!table || !ids.length) return NextResponse.json({ ok: false, error: "table and ids are required" }, { status: 400 });
  const admin = supabaseAdmin();
  let q;
  if (STATUS.has(action)) q = admin.from(table).update({ status: action }).in("id", ids);
  else if (action === "delete") q = admin.from(table).delete().in("id", ids);
  else if (action === "find_email" && table === "salesnav_people") q = admin.from(table).update({ enrich_status: "queued" }).in("id", ids).in("enrich_status", ["skipped", "no_domain", "failed", "pending"]);
  else if (action === "enrich" && table === "salesnav_accounts") q = admin.from(table).update({ enrich_status: "pending" }).in("id", ids).neq("enrich_status", "done");
  else return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  const { error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, n: ids.length });
}
