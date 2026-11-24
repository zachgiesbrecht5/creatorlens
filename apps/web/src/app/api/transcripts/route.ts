import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

// Full transcripts of an Instagram creator's reels. Admins only.
//   POST { handle, max_posts? }              queue a run (reels already filed are skipped)
//   GET  ?handle=x&format=md|json|csv        download everything filed for that creator
const clean = (h: unknown) => String(h || "").trim().replace(/^.*instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "").toLowerCase();
const VALID = /^[a-z0-9._]{1,30}$/;

async function admin() {
  const me = await currentProfile();
  if (!me) return { error: NextResponse.json({ error: "Sign in" }, { status: 401 }) };
  if (me.plan !== "admin") return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return { me };
}

export async function POST(req: NextRequest) {
  const a = await admin(); if (a.error) return a.error;
  const body = await req.json().catch(() => ({}));
  const handle = clean(body.handle);
  if (!VALID.test(handle)) return NextResponse.json({ error: "Type an Instagram handle, like @okay.ainsley" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: open } = await sb.from("transcript_jobs").select("id").eq("handle", handle).in("status", ["queued", "running"]).limit(1);
  if (open?.length) return NextResponse.json({ ok: true, already: true });
  const max_posts = Math.min(Math.max(Number(body.max_posts) || 500, 1), 2000);
  const { error } = await sb.from("transcript_jobs").insert({ handle, max_posts, requested_by: a.me!.id });
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}

const LABEL: Record<string, string> = { voice: "Talking", music: "Music or a sound, no talking", silent: "No sound", nofile: "Licensed audio, Instagram gives no file", unread: "Could not be read" };
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

export async function GET(req: NextRequest) {
  const a = await admin(); if (a.error) return a.error;
  const handle = clean(req.nextUrl.searchParams.get("handle"));
  if (!VALID.test(handle)) return NextResponse.json({ error: "Bad handle" }, { status: 400 });
  const format = req.nextUrl.searchParams.get("format") || "md";
  const sb = supabaseAdmin();
  const rows: any[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await sb.from("post_transcripts").select("url,published_at,caption,likes,comments,seconds,audio,text").eq("handle", handle).order("published_at", { ascending: false }).range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  if (format === "json") return NextResponse.json({ handle, reels: rows });
  const name = `${handle}-transcripts`;
  if (format === "csv") {
    const out = ["date,url,audio,seconds,likes,comments,transcript,caption", ...rows.map((r) => [String(r.published_at || "").slice(0, 10), r.url, r.audio, r.seconds ?? "", r.likes ?? "", r.comments ?? "", csv(r.text), csv(r.caption)].join(","))].join("\n");
    return new NextResponse(out, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"` } });
  }
  const talking = rows.filter((r) => r.audio === "voice").length;
  const md = [`# @${handle}: reel transcripts`, "", `${rows.length} reels, ${talking} with talking. Newest first.`, "",
    ...rows.flatMap((r) => [`## ${String(r.published_at || "").slice(0, 10) || "Undated"}`, "", r.url, `${LABEL[r.audio] || r.audio}${r.seconds ? ` · ${Math.round(r.seconds)}s` : ""} · ${(r.likes ?? 0).toLocaleString("en-US")} likes · ${(r.comments ?? 0).toLocaleString("en-US")} comments`, "",
      ...(r.audio === "voice" && r.text ? [r.text, ""] : r.audio === "music" && r.text ? [`Sung or sampled: ${r.text}`, ""] : []),
      ...(r.caption ? [`Caption: ${String(r.caption).replace(/\s+/g, " ").trim()}`, ""] : [])])].join("\n");
  return new NextResponse(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${name}.md"` } });
}
