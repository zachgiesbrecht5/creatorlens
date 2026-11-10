import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { titleSearchAccess, promptKey, SEARCH_FRESH_DAYS, WINDOWS, FORMATS } from "@/lib/titlesearch";

// GET ?id= -> status (the result page polls this while the worker runs)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  const a = await titleSearchAccess();
  if (!a.view) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { data } = await supabaseAdmin().from("title_searches").select("status,error,items_n,finished_at").eq("id", id).maybeSingle();
  return NextResponse.json(data || { status: "none" });
}

// POST { prompt, format?, windowDays?, force? } -> { id }. The same search (prompt + format + window)
// run by anyone in the last 7 days is reused instead of spending quota again.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = String(body.prompt || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (prompt.length < 3) return NextResponse.json({ error: "Type a topic, like \"budget PC builds\" or \"new dad finance\"." }, { status: 400 });
  const format = (FORMATS as readonly string[]).includes(body.format) ? body.format : "any";
  const windowDays = (WINDOWS as readonly number[]).includes(Number(body.windowDays)) ? Number(body.windowDays) : 90;
  const a = await titleSearchAccess();
  if (!a.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!a.run) return NextResponse.json({ error: "Title Search is on Pro and Agency plans." }, { status: 402 });
  const admin = supabaseAdmin();
  const key = promptKey(prompt);

  const since = new Date(Date.now() - SEARCH_FRESH_DAYS * 864e5).toISOString();
  const { data: hit } = await admin.from("title_searches").select("id,status").eq("prompt_key", key).eq("format", format).eq("window_days", windowDays)
    .in("status", ["queued", "running", "done"]).gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (hit && !(body.force && hit.status === "done")) return NextResponse.json({ id: hit.id, cached: hit.status === "done" });

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const { count } = await admin.from("title_searches").select("id", { count: "exact", head: true }).eq("user_id", a.user.id).gte("created_at", today.toISOString());
  if ((count || 0) >= a.perDay) return NextResponse.json({ error: `That's ${a.perDay} title searches today; the allowance resets at midnight UTC (6 PM Central). Searches someone already ran this week are still free to open.` }, { status: 429 });

  const { data: row, error } = await admin.from("title_searches").insert({ user_id: a.user.id, prompt, prompt_key: key, format, window_days: windowDays }).select("id").single();
  if (error || !row) return NextResponse.json({ error: error?.message || "Couldn't start" }, { status: 500 });
  admin.from("events").insert({ user_id: a.user.id, name: "title_search", props: { prompt, format, window_days: windowDays } }).then(() => {}, () => {});
  return NextResponse.json({ id: row.id });
}
