import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { titleLabAccess } from "@/lib/titlelab";

const MODEL = process.env.ANTHROPIC_TITLES_MODEL || "claude-haiku-4-5";

// POST { creatorId, draft } -> 3 alternative titles built from this channel's own winning patterns.
// Runs inline (the person is waiting); ~1c on Haiku. Logged to title_lab_rewrites.
export async function POST(req: NextRequest) {
  const { creatorId, draft } = await req.json().catch(() => ({}));
  const text = String(draft || "").trim().slice(0, 200);
  if (!text) return NextResponse.json({ error: "Type a draft title first." }, { status: 400 });
  const a = await titleLabAccess(String(creatorId || ""));
  if (!a.creator || !a.view) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!a.run) return NextResponse.json({ error: "Title rewrites are on Pro and Agency plans." }, { status: 402 });
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "PASTE_ME") return NextResponse.json({ error: "No model key configured." }, { status: 503 });
  const admin = supabaseAdmin();
  const { data: lab } = await admin.from("title_labs").select("items,patterns,reading,status").eq("creator_id", creatorId).maybeSingle();
  if (!lab || lab.status !== "done") return NextResponse.json({ error: "Run the Title Lab first so the rewrite knows this channel." }, { status: 409 });
  const items = (lab.items as any[]) || [];
  const top = items.filter((i) => !i.climbing && i.mult != null).slice(0, 12).map((i) => `- "${i.title}" (${i.mult}x)`).join("\n");
  const lifts = ((lab.patterns as any[]) || []).filter((p) => p.lift != null).slice(0, 6).map((p) => `- ${p.label}: ${p.lift}x`).join("\n");
  const reading = lab.reading as any;
  const system = `You write YouTube titles in a specific creator's voice for their manager. You get the channel's best-performing titles, the measured pattern lifts, and the manager's read of what works. Rewrite the draft into 3 alternatives that keep the video's actual subject (never invent claims or results the draft doesn't support) and apply this channel's own winning patterns. Each under 70 characters, no clickbait words the channel doesn't already use, no emoji unless the channel uses them. Name the pattern each one uses in 2-5 words and say in one short sentence why it should travel better than the draft.
Reply ONLY with JSON: {"options":[{"title":"...","pattern":"...","why":"..."}, {...}, {...}], "note":"one sentence on what the draft is missing, or empty"}`;
  const user = `Draft title: "${text}"

Channel's strongest titles:
${top}

Measured lifts:
${lifts || "(none yet)"}

Manager's read:
${reading ? `${reading.summary}\nRules: ${(reading.rules || []).join(" / ")}\nAvoid: ${(reading.avoid || []).join(" / ")}` : "(no read yet)"}`;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let msg;
  try { msg = await client.messages.create({ model: MODEL, max_tokens: 700, temperature: 0.6, system, messages: [{ role: "user", content: user }] }); }
  catch (e: any) { return NextResponse.json({ error: /credit|billing/i.test(String(e?.message)) ? "Model credit is out; ask the admin to top up." : "Model call failed." }, { status: 502 }); }
  const out = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return NextResponse.json({ error: "No titles came back; try again." }, { status: 502 });
  let parsed: any; try { parsed = JSON.parse(m[0]); } catch { return NextResponse.json({ error: "No titles came back; try again." }, { status: 502 }); }
  const options = (Array.isArray(parsed.options) ? parsed.options : []).slice(0, 3).filter((o: any) => o?.title).map((o: any) => ({ title: String(o.title).slice(0, 120), pattern: String(o.pattern || "").slice(0, 60), why: String(o.why || "").slice(0, 200) }));
  const usage: any = (msg as any).usage || {};
  const cost = +(((usage.input_tokens || 0) / 1e6) * 1 + ((usage.output_tokens || 0) / 1e6) * 5).toFixed(4);
  admin.from("model_spend").insert({ job: "titlelab_rewrite", model: MODEL, cost_usd: cost, input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, ref: a.creator.handle }).then(() => {}, () => {});
  admin.from("title_lab_rewrites").insert({ creator_id: creatorId, user_id: a.user!.id, draft: text, options, model: MODEL, model_cost: cost }).then(() => {}, () => {});
  return NextResponse.json({ options, note: String(parsed.note || "").slice(0, 200) });
}
