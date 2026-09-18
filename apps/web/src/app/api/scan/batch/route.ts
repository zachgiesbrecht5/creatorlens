import { NextResponse, type NextRequest } from "next/server";
import { currentUser, supabaseAdmin } from "@/lib/supabase";
import { track } from "@/lib/track";

// POST { lines: string }  -> queues a print per handle. Accepts one handle per
// line or comma-separated: "@handle", "handle", youtube.com/@handle,
// instagram.com/handle, or "yt:handle" / "ig:handle" to force a platform.
// Default platform for bare handles comes from `platform`. Credits: one per
// non-cached print (paid plans unlimited), same as the search box.
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to run a batch" }, { status: 401 });
  const { lines, platform: defaultPlatform } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  const parse = (raw: string): { platform: "youtube" | "instagram"; handle: string } | null => {
    let s = raw.trim(); if (!s) return null;
    let platform: "youtube" | "instagram" = defaultPlatform === "instagram" ? "instagram" : "youtube";
    const url = s.match(/(youtube\.com|youtu\.be|instagram\.com)\/(@?[A-Za-z0-9._-]+)/i);
    if (url) { platform = /instagram/i.test(url[1]) ? "instagram" : "youtube"; s = url[2]; }
    else if (/^(yt|youtube):/i.test(s)) { platform = "youtube"; s = s.replace(/^(yt|youtube):/i, ""); }
    else if (/^(ig|instagram):/i.test(s)) { platform = "instagram"; s = s.replace(/^(ig|instagram):/i, ""); }
    s = s.replace(/^@/, "").replace(/[?#].*$/, "").trim();
    if (!/^[A-Za-z0-9._-]{2,40}$/.test(s)) return null;
    return { platform, handle: platform === "instagram" ? s.toLowerCase() : s };
  };
  const items = [...new Map(String(lines || "").split(/[\n,]+/).map(parse).filter(Boolean).map((p) => [`${p!.platform}:${p!.handle.toLowerCase()}`, p!])).values()].slice(0, 100);
  if (!items.length) return NextResponse.json({ error: "No handles found" }, { status: 400 });

  const results: { platform: string; handle: string; status: "cached" | "queued" | "no_credits" | "error"; jobId?: string }[] = [];
  for (const it of items) {
    // already fresh in the index? no credit, just unlock
    const fresh = await admin.from("creators").select("id,last_scanned_at").eq("platform", it.platform).ilike("handle", it.handle).maybeSingle();
    const isFresh = fresh.data?.last_scanned_at && Date.now() - new Date(fresh.data.last_scanned_at).getTime() < 14 * 864e5;
    await admin.from("creator_access").upsert({ user_id: user.id, platform: it.platform, handle: it.handle.toLowerCase() }, { onConflict: "user_id,platform,handle", ignoreDuplicates: true });
    if (isFresh) { results.push({ ...it, status: "cached" }); continue; }
    const { data: existing } = await admin.from("scan_jobs").select("id").eq("platform", it.platform).ilike("handle", it.handle).in("status", ["queued", "running", "rate_limited"]).limit(1);
    if (existing?.length) { results.push({ ...it, status: "queued", jobId: existing[0].id }); continue; }
    const { data: ok } = await admin.rpc("spend_credit", { p_user: user.id, p_kind: "scan", p_reason: "batch", p_ref: `${it.platform}:${it.handle}` });
    if (!ok) { results.push({ ...it, status: "no_credits" }); continue; }
    const { data: job, error } = await admin.from("scan_jobs").insert({ user_id: user.id, platform: it.platform, handle: it.handle, priority: 5 }).select("id").single();
    if (error || !job) { results.push({ ...it, status: "error" }); continue; }
    results.push({ ...it, status: "queued", jobId: job.id });
  }
  track(user.id, "batch", { n: items.length, queued: results.filter((r) => r.status === "queued").length, cached: results.filter((r) => r.status === "cached").length });
  return NextResponse.json({ results });
}
