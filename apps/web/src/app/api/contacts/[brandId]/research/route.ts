import { NextResponse } from "next/server";
import { currentAccess, supabaseAdmin } from "@/lib/supabase";

// Queue the research agent for one brand. House only; one job per brand, ever.
export async function POST(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { profile, insider } = await currentAccess();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (!insider) return NextResponse.json({ error: "Research is available to the house team." }, { status: 403 });
  const { brandId } = await params;
  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("contact_research").select("status").eq("brand_id", brandId).maybeSingle();
  if (existing && existing.status !== "failed") return NextResponse.json({ ok: true, status: existing.status });
  await admin.from("contact_research").upsert({ brand_id: brandId, requested_by: profile.id, status: "queued", error: null, finished_at: null }, { onConflict: "brand_id" });
  return NextResponse.json({ ok: true, status: "queued" });
}
