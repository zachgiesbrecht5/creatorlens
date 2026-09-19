import { NextResponse, type NextRequest } from "next/server";
import { currentAccess, supabaseAdmin } from "@/lib/supabase";
import { track } from "@/lib/track";

// POST { brandId } -> queue a brand print. House and paid plans; free users get one.
export async function POST(req: NextRequest) {
  const { profile, insider } = await currentAccess();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { brandId } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: recent } = await admin.from("brand_scans").select("id,status,created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recent && (recent.status === "queued" || recent.status === "running")) return NextResponse.json({ id: recent.id, status: recent.status });
  if (recent && recent.status === "done" && Date.now() - new Date(recent.created_at).getTime() < 7 * 864e5) return NextResponse.json({ id: recent.id, status: "done", fresh: true });
  const paid = insider || ["pro", "agency"].includes(profile.plan);
  if (!paid) { const { count } = await admin.from("brand_scans").select("*", { count: "exact", head: true }).eq("requested_by", profile.id); if ((count || 0) >= 1) return NextResponse.json({ error: "Brand prints are part of Pro. Your free one is used." }, { status: 402 }); }
  const { data: n, error } = await admin.from("brand_scans").insert({ brand_id: brandId, requested_by: profile.id }).select("id").single();
  if (error || !n) return NextResponse.json({ error: error?.message || "failed" }, { status: 500 });
  track(profile.id, "brand_scan", { brand_id: brandId });
  return NextResponse.json({ id: n.id, status: "queued" });
}

export async function GET(req: NextRequest) {
  const { profile } = await currentAccess();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  const { data } = await supabaseAdmin().from("brand_scans").select("id,status,found,ig_pulse,error").eq("id", id).single();
  return NextResponse.json(data || { error: "not found" });
}
