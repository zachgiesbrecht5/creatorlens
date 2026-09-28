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
  const admin = supabaseAdmin();
  const { data } = await admin.from("brand_scans").select("id,status,found,ig_pulse,error,brand_id").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const found = (data.found || []) as any[];
  const ext = found.map((f) => f.external_id).filter(Boolean);
  const { data: creators } = ext.length ? await admin.from("creators").select("id,handle,external_id,display_name,avatar_url,followers,last_scanned_at,category") .in("external_id", ext) : { data: [] };
  const { data: jobs } = ext.length ? await admin.from("scan_jobs").select("handle,status").in("handle", ext).order("created_at", { ascending: false }) : { data: [] };
  const ids = (creators || []).map((c) => c.id);
  const { data: booked } = ids.length ? await admin.from("brand_wall").select("creator_id,deals").eq("brand_id", data.brand_id).in("creator_id", ids) : { data: [] };
  const rows = found.map((f) => {
    const c = (creators || []).find((x) => x.external_id === f.external_id);
    const job = (jobs || []).find((j) => j.handle === f.external_id);
    const deal = (booked || []).find((b) => b.creator_id === c?.id);
    return { ...f, print_status: c?.last_scanned_at ? "done" : job?.status || (f.queued === "cached" ? "done" : "queued"), handle: c?.handle || f.external_id, display_name: c?.display_name || f.title, avatar_url: c?.avatar_url || null, followers: c?.followers ?? null, category: c?.category || null, confirmed_deals: deal ? Number(deal.deals) : 0, new_to_index: !f.known };
  });
  return NextResponse.json({ id: data.id, status: data.status, found: rows, ig_pulse: data.ig_pulse, error: data.error });
}
