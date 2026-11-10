// Title Search worker job. A queued title_searches row (a topic prompt) becomes:
//  1. a few YouTube searches (Haiku turns the prompt into the phrasings creators actually title with),
//  2. video + channel stats for every hit (cheap list calls),
//  3. each video scored against its own channel: the median of the channel's latest uploads for the
//     strongest candidates (refine pass), the lifetime average views per video for the rest ("est"),
//  4. the pattern lift table across channels and one Haiku read with templates a creator can use.
// search.list is 100 units, so a search costs ~450 units; TITLE_SEARCH_DAILY_UNITS caps the day.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchVideoIds, getVideos, channelStats, latestVideoIds, channelMedians, scoreTopic, capPerChannel, liftTable, isEnglishTitle, kindOf, type QuotaMeter, type TopicChannel, type TopicItem, type TitlePattern } from "@creatorlens/engine";
import { recordSpend, noteModelError, noteAnyModelError, cleanForModel } from "./spend";

const MODEL = process.env.ANTHROPIC_TITLES_MODEL || "claude-haiku-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[titlesearch]", ...a);
export const TITLE_SEARCH_DAILY_UNITS = Number(process.env.TITLE_SEARCH_DAILY_UNITS || 4000);
const REFINE_CHANNELS = Number(process.env.TITLE_SEARCH_REFINE || 80);   // 2 units a channel: measure nearly all of them against a real median
const KEEP = 120;

const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const parseJson = (text: string) => { const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error("no JSON from titles model"); return JSON.parse(m[0]); };

/** 2 phrasings creators would actually use for this topic (plus the raw prompt, run by views). */
async function expandPrompt(sb: SupabaseClient, prompt: string): Promise<{ queries: string[]; cost: number }> {
  if (!client) return { queries: [], cost: 0 };
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 200, temperature: 0.2,
    system: `Turn a talent manager's topic into YouTube search queries that match how creators title videos on it. Short (2-6 words), different angles, no quotes, no hashtags, no operators. Reply ONLY with JSON: {"queries":["...","..."]} (exactly 2).`,
    messages: [{ role: "user", content: cleanForModel(prompt) }],
  });
  const cost = await recordSpend(sb, "titlesearch", MODEL, (msg as any).usage, prompt.slice(0, 60)).catch(() => 0);
  const j = parseJson(msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join(""));
  const queries = (Array.isArray(j.queries) ? j.queries : []).map((q: any) => String(q).replace(/["#]/g, "").trim().slice(0, 80)).filter(Boolean).slice(0, 2);
  return { queries, cost };
}

export interface TopicReading {
  summary: string;
  winning: { name: string; why: string; examples: string[] }[];
  weak: { name: string; why: string; examples: string[] }[];
  rules: string[];
  /** fill-in-the-blank title shapes taken from the winners */
  templates: { template: string; example: string }[];
  /** subjects / angles that broke out, separate from wording */
  angles: string[];
}

async function readTopic(sb: SupabaseClient, prompt: string, items: TopicItem[], patterns: TitlePattern[]): Promise<{ reading: TopicReading; cost: number } | null> {
  if (!client) return null;
  const settled = items.filter((i) => !i.climbing && i.mult != null);
  if (settled.length < 10) return null;
  const n = Math.min(20, Math.max(6, Math.round(settled.length * 0.2)));
  const top = settled.slice(0, n); const bottom = settled.slice(-Math.min(12, n)).reverse();
  const line = (i: TopicItem) => `- "${i.title}" · ${i.channel_title} (${fmtN(i.subs)} subs) · ${fmtN(i.views)} views · ${i.mult}x its channel's ${i.baseline_kind === "median" ? "median" : "average"} · ${i.kind}`;
  const lifts = patterns.filter((p) => p.lift != null && p.with_n >= 4).slice(0, 8).map((p) => `- ${p.label}: ${p.lift}x (${p.with_n} with, ${p.without_n} without)`).join("\n");
  const system = `You coach YouTube creators on titles for a talent manager. You see videos on one topic from many different channels. Each has a multiple: its views divided by that channel's usual views, so a small channel's breakout ranks above a big channel's normal upload. Explain what the breakout titles do that the ordinary ones don't, using the actual titles. Keep wording (how it's phrased) separate from angle (what the video is about). Correlation, not causation: thumbnails, topic and timing matter too, so say "tend to". No hype words. Short sentences.
Reply ONLY with JSON:
{"summary": "2-3 sentences: what separates breakout titles on this topic from the rest",
 "winning": [{"name": "3-6 word pattern name", "why": "one sentence", "examples": ["exact title", ...]}],  (3-4 items)
 "weak": [{"name": "...", "why": "one sentence", "examples": ["exact title", ...]}],  (2 items)
 "rules": ["imperative, under 14 words", ...],  (4-5 items)
 "templates": [{"template": "a reusable title shape with [BRACKETED] blanks", "example": "the exact winning title it came from"}],  (4-5 items)
 "angles": ["a subject or angle that broke out, under 12 words", ...]}  (3-4 items)`;
  const user = `Topic: ${prompt}
Settled videos ranked: ${settled.length} from ${new Set(settled.map((i) => i.channel_id)).size} channels

BREAKOUT titles (highest multiples):
${top.map(line).join("\n")}

ORDINARY titles (lowest multiples):
${bottom.map(line).join("\n")}

Measured lift across channels (median multiple with the pattern vs without):
${lifts || "(not enough titles on both sides yet)"}`;
  const msg = await client.messages.create({ model: MODEL, max_tokens: 1800, temperature: 0.3, system, messages: [{ role: "user", content: cleanForModel(user) }] });
  const cost = await recordSpend(sb, "titlesearch", MODEL, (msg as any).usage, prompt.slice(0, 60)).catch(() => 0);
  const r = parseJson(msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join(""));
  const arr = (x: any, k: number) => (Array.isArray(x) ? x.slice(0, k) : []);
  const grp = (x: any, k: number) => arr(x, k).filter((g: any) => g && g.name).map((g: any) => ({ name: String(g.name).slice(0, 60), why: String(g.why || "").slice(0, 240), examples: arr(g.examples, 3).map((e: any) => String(e).slice(0, 140)) }));
  return {
    cost,
    reading: {
      summary: String(r.summary || "").slice(0, 600),
      winning: grp(r.winning, 4), weak: grp(r.weak, 2),
      rules: arr(r.rules, 5).map((s: any) => String(s).slice(0, 120)),
      templates: arr(r.templates, 5).filter((t: any) => t?.template).map((t: any) => ({ template: String(t.template).slice(0, 120), example: String(t.example || "").slice(0, 140) })),
      angles: arr(r.angles, 4).map((s: any) => String(s).slice(0, 120)),
    },
  };
}

async function unitsToday(sb: SupabaseClient): Promise<number> {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { data } = await sb.from("title_searches").select("quota_units").gte("created_at", since.toISOString()).limit(500);
  return (data || []).reduce((s, r: any) => s + (r.quota_units || 0), 0);
}

async function runOne(sb: SupabaseClient, ytKey: string, row: { id: string; prompt: string; format: string; window_days: number }, spendYt: (units: number) => Promise<void>) {
  const upd = (patch: Record<string, unknown>) => sb.from("title_searches").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id);
  await upd({ status: "running", started_at: new Date().toISOString(), error: null });
  const meter: QuotaMeter = { units: 0 };
  let cost = 0;
  try {
    // 1. queries
    let queries: string[] = [];
    try { const e = await expandPrompt(sb, row.prompt); queries = e.queries; cost += e.cost; }
    catch (e: any) { noteAnyModelError(); if (!noteModelError(e)) log("expand failed", String(e?.message || e).slice(0, 160)); }
    const after = new Date(Date.now() - row.window_days * 864e5);
    const duration = row.format === "short" ? "short" : "any";
    const runs: { q: string; order: "relevance" | "viewCount" }[] = [{ q: row.prompt, order: "viewCount" }, { q: row.prompt, order: "relevance" }, ...queries.filter((q) => q.toLowerCase() !== row.prompt.toLowerCase()).map((q) => ({ q, order: "relevance" as const }))];
    const ids = new Set<string>();
    for (const r of runs.slice(0, 4)) {
      const got = await searchVideoIds(ytKey, r.q, { order: r.order, publishedAfter: after, max: 50, duration, lang: "en", region: "US" }, meter);
      got.forEach((id) => ids.add(id));
    }
    await upd({ queries: runs.slice(0, 4).map((r) => (r.order === "viewCount" ? `${r.q} (most viewed)` : r.q)) });
    // 2. stats
    let videos = await getVideos(ytKey, [...ids], meter);
    videos = videos.filter((v) => isEnglishTitle(v.title));
    if (row.format !== "any") videos = videos.filter((v) => kindOf(v.durationSeconds, v.title) === row.format);
    const stats = await channelStats(ytKey, videos.map((v) => v.channelId || ""), meter);
    const channels = new Map<string, TopicChannel>([...stats.values()].map((c) => [c.id, { ...c }]));
    const topicVideos = videos.filter((v) => v.channelId).map((v) => ({ id: v.id, title: v.title, publishedAt: v.publishedAt, views: v.views, durationSeconds: v.durationSeconds, channelId: v.channelId as string }));
    // 3. first pass on lifetime averages, then refine the leading channels with real medians (2 units each)
    const first = scoreTopic(topicVideos, channels);
    const lead = [...new Set(first.map((i) => i.channel_id))].slice(0, REFINE_CHANNELS);
    for (const cid of lead) {
      const ch = stats.get(cid); if (!ch?.uploadsPlaylist) continue;
      try {
        const recent = await getVideos(ytKey, await latestVideoIds(ytKey, ch.uploadsPlaylist, 50, meter), meter);
        const m = channelMedians(recent.map((v) => ({ id: v.id, title: v.title, publishedAt: v.publishedAt, views: v.views, durationSeconds: v.durationSeconds })));
        const c = channels.get(cid)!; c.median_video = m.median_video; c.median_short = m.median_short;
      } catch (e: any) { if (e?.quota) throw e; }
    }
    await spendYt(meter.units);
    const ranked = scoreTopic(topicVideos, channels);
    const items = capPerChannel(ranked, 2).slice(0, KEEP);
    // a pattern needs 8 titles on each side before a lift is shown: 4-vs-70 comparisons are noise
    const patterns = liftTable(capPerChannel(ranked, 4), 8);
    // 4. read
    let reading: TopicReading | null = null;
    try { const r = await readTopic(sb, row.prompt, items, patterns); if (r) { reading = r.reading; cost += r.cost; } }
    catch (e: any) { noteAnyModelError(); if (!noteModelError(e)) log("read failed", String(e?.message || e).slice(0, 200)); }
    await upd({
      status: "done", items, items_n: items.length, channels_n: new Set(items.map((i) => i.channel_id)).size, patterns, reading,
      model: reading ? MODEL : null, model_cost: cost, quota_units: meter.units, finished_at: new Date().toISOString(),
      error: items.length < 5 ? "Very few videos matched; try a broader topic or a longer window." : reading ? null : (client ? "Model read unavailable right now; the ranking is in." : "No model key on the worker; ranking only."),
    });
    log(`done "${row.prompt}": ${items.length} titles, ${meter.units} units, $${cost}`);
  } catch (e: any) {
    if (meter.units) await spendYt(meter.units).catch(() => {});
    await upd({ status: "failed", error: e?.quota ? "YouTube quota is used up for today; try again tomorrow." : String(e?.message || e).slice(0, 400), quota_units: meter.units, model_cost: cost, finished_at: new Date().toISOString() });
    log("failed", row.prompt, e?.message);
  }
}

/** Pick up queued searches, one at a time, within the daily unit cap and the house YouTube budget. */
export async function runTitleSearches(sb: SupabaseClient, ytKey: string, ytLeft: () => Promise<number>, spendYt: (units: number) => Promise<void>): Promise<number> {
  const { data: jobs } = await sb.from("title_searches").select("id,prompt,format,window_days").eq("status", "queued").order("created_at").limit(1);
  const row = jobs?.[0]; if (!row) return 0;
  if ((await unitsToday(sb)) + 500 > TITLE_SEARCH_DAILY_UNITS || (await ytLeft()) < 1000) {
    await sb.from("title_searches").update({ status: "failed", error: "Today's title-search allowance is used up; it resets at midnight UTC (6 PM Central).", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id);
    return 0;
  }
  await runOne(sb, ytKey, row as any, spendYt);
  return 1;
}
