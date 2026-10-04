import { NextResponse, type NextRequest } from "next/server";
import { ownRoster } from "@/lib/portal-admin";
import { supabaseAdmin } from "@/lib/supabase";
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const ctx = await ownRoster(b.rosterCreatorId); if (!ctx) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const patch: any = { portal_enabled: !!b.enabled }; if (b.creator_email !== undefined) patch.creator_email = String(b.creator_email || "").trim().toLowerCase() || null;
  if (b.thesis !== undefined) patch.thesis = String(b.thesis || "").trim().slice(0, 600) || null;
  await supabaseAdmin().from("roster_creators").update(patch).eq("id", ctx.roster.id);
  return NextResponse.json({ ok: true });
}
