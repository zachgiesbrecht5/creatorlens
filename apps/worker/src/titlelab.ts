// Title Lab worker job. For a queued title_labs row: pull the channel's recent
// uploads (cheap list calls, no search quota), score every title against the
// channel's own median, build the pattern lift table, then one Haiku call that
// reads the strongest vs weakest titles and writes the "why" a manager can hand
// to the creator. A click always runs (the person is waiting); the daily model
// budget only gates automatic refreshes.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveChannel, listVideoIds, getVideos, analyzeTitles, splitTitles, type QuotaMeter, type TitleItem, type TitlePattern } from "@creatorlens/engine";
import { recordSpend, noteModelError, noteAnyModelError, cleanForModel } from "./spend";

const MODEL = process.env.ANTHROPIC_TITLES_MODEL || "claude-haiku-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[titlelab]", ...a);
const LOOKBACK_DAYS = Number(process.env.TITLE_LAB_LOOKBACK_DAYS || 730);
const MAX_VIDEOS = Number(process.env.TITLE_LAB_MAX_VIDEOS || 200);

export interface TitleReading {
  summary: string;
  winning: { name: string; why: string; examples: string[] }[];
  weak: { name: string; why: string; examples: string[] }[];
  rules: string[];
  avoid: string[];
  /** a short note written to the creator, ready to paste */
  feedback: string;
}

const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

async function readTitles(sb: SupabaseClient, creator: { handle: string; display_name: string | null; category: string | null; followers: number | null }, items: TitleItem[], patterns: TitlePattern[]): Promise<{ reading: TitleReading; cost: number } | null> {
  if (!client) return null;
  const { top, bottom, settled } = splitTitles(items);
  if (top.length < 3 || bottom.length < 3) return null;
  const line = (i: TitleItem) => `- "${i.title}" · ${fmtN(i.views)} views · ${i.mult}x median · ${i.kind}${i.sponsored ? " · sponsored" : ""}`;
  const lifts = patterns.filter((p) => p.lift != null && p.with_n >= 3).slice(0, 8).map((p) => `- ${p.label}: ${p.lift}x (${p.with_n} titles with, ${p.without_n} without)`).join("\n");
  const system = `You coach YouTube creators on titles for a talent manager. You will see a channel's strongest and weakest titles, each with its view multiple against the channel's own median, plus a measured lift table. Explain what the winning titles do that the weak ones don't, in the creator's own terms, using their actual titles as examples. Be concrete and specific to THIS channel; never generic YouTube advice. Correlation, not causation: thumbnails and topic matter too, so say "tend to" not "cause". No hype words. Short sentences.
Reply ONLY with JSON:
{"summary": "2-3 sentences on the channel's title pattern, what separates top from bottom",
 "winning": [{"name": "3-6 word pattern name", "why": "one sentence", "examples": ["exact title", ...]}],  (3-4 items)
 "weak": [{"name": "...", "why": "one sentence", "examples": ["exact title", ...]}],  (2-3 items)
 "rules": ["imperative, under 14 words", ...],  (4-5 items the creator can apply to the next title)
 "avoid": ["imperative, under 14 words", ...],  (2-3 items)
 "feedback": "A 90-130 word note from the manager to the creator, first name only, warm and direct, no greeting line, no sign-off, plain text, no bullet points. Names two winning patterns with one real title each, one thing to drop, and one concrete suggestion for the next upload."}`;
  const user = `Channel: ${creator.display_name || creator.handle} (@${creator.handle}, ${creator.followers ? fmtN(creator.followers) + " subscribers" : "size unknown"}, niche: ${creator.category || "unknown"})
Settled videos analysed: ${settled} (videos under 10 days old excluded; Shorts judged against the Shorts median)

STRONGEST titles (top fifth):
${top.map(line).join("\n")}

WEAKEST titles (bottom fifth):
${bottom.map(line).join("\n")}

Measured lift (median multiple with the pattern vs without):
${lifts || "(not enough titles on both sides for any pattern yet)"}`;
  const msg = await client.messages.create({ model: MODEL, max_tokens: 1800, temperature: 0.3, system, messages: [{ role: "user", content: cleanForModel(user) }] });
  const cost = await recordSpend(sb, "titlelab", MODEL, (msg as any).usage, creator.handle).catch(() => 0);
  const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON from titles model");
  const r = JSON.parse(m[0]);
  const arr = (x: any, n: number) => (Array.isArray(x) ? x.slice(0, n) : []);
  const grp = (x: any, n: number) => arr(x, n).filter((g: any) => g && g.name).map((g: any) => ({ name: String(g.name).slice(0, 60), why: String(g.why || "").slice(0, 240), examples: arr(g.examples, 3).map((e: any) => String(e).slice(0, 140)) }));
  const reading: TitleReading = {
    summary: String(r.summary || "").slice(0, 600),
    winning: grp(r.winning, 4), weak: grp(r.weak, 3),
    rules: arr(r.rules, 5).map((s: any) => String(s).slice(0, 120)), avoid: arr(r.avoid, 3).map((s: any) => String(s).slice(0, 120)),
    feedback: String(r.feedback || "").slice(0, 1200),
  };
  return { reading, cost };
}

async function runOne(sb: SupabaseClient, ytKey: string, lab: { creator_id: string }, spendYt: (units: number) => Promise<void>) {
  await sb.from("title_labs").update({ status: "running", started_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() }).eq("creator_id", lab.creator_id);
  const { data: creator } = await sb.from("creators").select("id,platform,handle,external_id,display_name,category,followers").eq("id", lab.creator_id).single();
  if (!creator) throw new Error("creator missing");
  if (creator.platform !== "youtube") throw new Error("Title Lab reads YouTube channels only");
  const meter: QuotaMeter = { units: 0 };
  const ch = await resolveChannel(ytKey, creator.external_id || creator.handle, meter);
  if (!ch) throw new Error("Channel not found on YouTube");
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const ids = (await listVideoIds(ytKey, ch.uploadsPlaylist, cutoff, meter, Math.ceil(MAX_VIDEOS / 50))).slice(0, MAX_VIDEOS);
  const videos = await getVideos(ytKey, ids, meter);
  await spendYt(meter.units);
  // sponsored flags from the print, so the read can see when an integration outperformed
  const { data: sp } = await sb.from("partnerships").select("content_id").eq("creator_id", creator.id).neq("status", "rejected").in("confidence_label", ["High", "Medium"]).limit(2000);
  const sponsored = new Set((sp || []).map((r) => r.content_id));
  const analysis = analyzeTitles(videos.map((v) => ({ id: v.id, title: v.title, publishedAt: v.publishedAt, views: v.views, durationSeconds: v.durationSeconds, sponsored: sponsored.has(v.id) })));
  let reading: TitleReading | null = null; let cost = 0;
  try { const r = await readTitles(sb, creator, analysis.items, analysis.patterns); if (r) { reading = r.reading; cost = r.cost; } }
  catch (e: any) { noteAnyModelError(); if (!noteModelError(e)) log("read failed", creator.handle, String(e?.message || e).slice(0, 200)); }
  await sb.from("title_labs").update({
    status: "done", items: analysis.items, items_n: analysis.items.length, median_video: analysis.median_video, median_short: analysis.median_short,
    patterns: analysis.patterns, reading, model: reading ? MODEL : null, model_cost: cost, quota_units: meter.units,
    finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), error: reading ? null : (client ? "Model read unavailable right now; the numbers are in." : "No model key on the worker; numbers only."),
  }).eq("creator_id", lab.creator_id);
  log(`done @${creator.handle}: ${analysis.items.length} videos, ${meter.units} units, $${cost}`);
}

/** Pick up queued labs. Called from the worker tick alongside neighborhoods. */
export async function runTitleLabs(sb: SupabaseClient, ytKey: string, spendYt: (units: number) => Promise<void>, limit = 2): Promise<number> {
  const { data: jobs } = await sb.from("title_labs").select("creator_id").eq("status", "queued").order("updated_at").limit(limit);
  for (const j of jobs || []) {
    try { await runOne(sb, ytKey, j, spendYt); }
    catch (e: any) {
      log("failed", j.creator_id, e?.message);
      await sb.from("title_labs").update({ status: "failed", error: String(e?.message || e).slice(0, 400), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("creator_id", j.creator_id);
    }
  }
  return (jobs || []).length;
}
