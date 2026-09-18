import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { track } from "@/lib/track";

// POST { rosterCreatorId } -> queue a neighborhood find (3 adjacent creators, printed free).
// GET  ?id=... -> status + candidates + live print status for each.
export async function POST(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { rosterCreatorId } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: rc } = await admin.from("roster_creators").select("id,user_id").eq("id", rosterCreatorId).single();
  if (!rc || rc.user_id !== profile.id) return NextResponse.json({ error: "Not your creator" }, { status: 403 });
  const { data: recent } = await admin.from("neighborhoods").select("id,status").eq("roster_creator_id", rc.id).in("status", ["queued", "running", "done"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recent && recent.status !== "done") return NextResponse.json({ id: recent.id, status: recent.status });
  if (recent && recent.status === "done" && !req.nextUrl.searchParams.get("again")) return NextResponse.json({ id: recent.id, status: "done" });
  const { data: n, error } = await admin.from("neighborhoods").insert({ user_id: profile.id, roster_creator_id: rc.id }).select("id").single();
  if (error || !n) return NextResponse.json({ error: error?.message || "failed" }, { status: 500 });
  track(profile.id, "neighborhood", { roster_creator_id: rc.id });
  return NextResponse.json({ id: n.id, status: "queued" });
}

export async function GET(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  const admin = supabaseAdmin();
  const { data: n } = await admin.from("neighborhoods").select("*").eq("id", id).single();
  if (!n || (n.user_id !== profile.id && profile.plan !== "admin")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const cands = (n.candidates || []) as any[];
  const jobIds = cands.map((c) => c.job_id).filter(Boolean);
  const { data: jobs } = jobIds.length ? await admin.from("scan_jobs").select("id,status,rows_found").in("id", jobIds) : { data: [] };
  const handles = cands.map((c) => String(c.handle).toLowerCase());
  const { data: creators } = handles.length ? await admin.from("creators").select("id,handle,platform,last_scanned_at").or(handles.map((h) => `handle.ilike.${h}`).join(",")) : { data: [] };
  const ids = (creators || []).map((c) => c.id);
  const { data: walls } = ids.length ? await admin.from("brand_wall").select("creator_id,brand,deals").in("creator_id", ids).eq("is_junk", false).limit(400) : { data: [] };
  const enriched = cands.map((c) => {
    const job = (jobs || []).find((j) => j.id === c.job_id);
    const cr = (creators || []).find((x) => x.platform === c.platform && String(x.handle).toLowerCase() === String(c.handle).toLowerCase());
    const brands = (walls || []).filter((w: any) => cr && w.creator_id === cr.id);
    const printed = c.cached || job?.status === "done" || (!!cr?.last_scanned_at && !job);
    return { ...c, print_status: printed ? "done" : job?.status || (c.cached ? "done" : "queued"), brands: brands.length, top: brands.sort((a: any, b: any) => Number(b.deals) - Number(a.deals)).slice(0, 4).map((b: any) => b.brand) };
  });
  return NextResponse.json({ id: n.id, status: n.status, error: n.error, candidates: enriched });
}
