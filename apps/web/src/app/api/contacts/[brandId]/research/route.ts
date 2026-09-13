import { NextResponse } from "next/server";
import { currentAccess, supabaseAdmin } from "@/lib/supabase";
import { track } from "@/lib/track";

// Queue the research agent for one brand. House only; one job per brand, ever.
export async function POST(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { profile, insider } = await currentAccess();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { brandId } = await params;
  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("contact_research").select("status,requested_by").eq("brand_id", brandId).maybeSingle();
  if (existing && existing.status !== "failed") return NextResponse.json({ ok: true, status: existing.status });
  // beta users pay a research credit; house/pro/admin are unlimited (spend_credit handles both)
  if (!insider) {
    const { data: ok } = await admin.rpc("spend_credit", { p_user: profile.id, p_kind: "research", p_reason: "research", p_ref: brandId });
    if (!ok) return NextResponse.json({ error: "You've used your research credits for the beta. Paste an email or ask us for more." }, { status: 402 });
  }
  await admin.from("contact_research").upsert({ brand_id: brandId, requested_by: profile.id, status: "queued", error: null, finished_at: null }, { onConflict: "brand_id" });
  track(profile.id, "research", { brand_id: brandId });
  return NextResponse.json({ ok: true, status: "queued" });
}
