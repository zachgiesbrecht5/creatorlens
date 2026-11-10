// Title Lab analysis. Pure functions: a channel's videos in, each title scored
// against the channel's own median (Shorts against the Shorts median) and a
// pattern lift table out. Ported from the Apps Script Content Radar
// (title-pattern LIFT: median multiple with vs without a pattern, 3+ each side).
// No network, no model; the worker adds the Haiku read on top.

export interface TitleVideo { id: string; title: string; publishedAt: string; views: number; durationSeconds: number; sponsored?: boolean }
export interface TitleItem {
  id: string; title: string; url: string; published_at: string; views: number;
  kind: "video" | "short"; sponsored: boolean;
  /** views / the median of this kind. null when the kind has no usable median. */
  mult: number | null;
  /** videos under CLIMB_DAYS old are shown but excluded from the medians (still collecting views) */
  climbing: boolean;
  words: number;
  tags: string[];
}
export interface TitlePattern {
  key: string; label: string; hint: string;
  with_n: number; without_n: number;
  with_mult: number | null; without_mult: number | null;
  /** with_mult / without_mult; > 1 means titles with this pattern outperform. null when either side has < MIN_SIDE videos */
  lift: number | null;
  examples: string[];
}
export interface TitleAnalysis { items: TitleItem[]; median_video: number | null; median_short: number | null; patterns: TitlePattern[] }

export const CLIMB_DAYS = 10;
const MIN_SIDE = 3;
// Shorts can run up to 3 minutes; the API has no "is a Short" flag, so: 3 minutes or under, or tagged #shorts.
const SHORT_SECONDS = 180;

const medianF = (xs: number[]): number | null => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const median = (xs: number[]): number | null => { const m = medianF(xs); return m == null ? null : Math.round(m); };
const words = (t: string) => String(t || "").trim().split(/\s+/).filter(Boolean).length;
const round1 = (n: number) => Math.round(n * 10) / 10;

// The patterns a manager can actually name back to a creator. Each test is a plain predicate on the title text.
type Def = { key: string; label: string; hint: string; test: (t: string) => boolean };
const CAPS_WORD = /\b[A-Z]{3,}\b/;
export const TITLE_PATTERNS: Def[] = [
  { key: "number", label: "Has a number", hint: "a count, price, time or year in the title", test: (t) => /\d/.test(t) },
  { key: "question", label: "Asks a question", hint: "ends in ? or opens with why/how/what/is/can/did", test: (t) => /\?/.test(t) || /^(why|how|what|is|are|can|did|does|do|should|will)\b/i.test(t.trim()) },
  { key: "how_why", label: "How / Why framing", hint: "starts with how or why", test: (t) => /^(how|why)\b/i.test(t.trim()) },
  { key: "first_person", label: "First person", hint: "I / my / we / me in the title", test: (t) => /\b(I|I'm|I've|my|me|we|we're|our)\b/.test(t) },
  { key: "you", label: "Speaks to you", hint: "you / your in the title", test: (t) => /\b(you|your|you're|you've)\b/i.test(t) },
  { key: "caps", label: "ALL-CAPS word", hint: "a shouted word like NEVER, FINALLY, WORST", test: (t) => CAPS_WORD.test(t.replace(/\b(TV|PC|AI|US|UK|NYC|LA|DIY|GPU|CPU|SSD|RTX|RGB|HD|4K|8K|PS5|PS4|XBOX|IOS|MAC|USB|DJ|EV|UFC|NBA|NFL|MLB|NHL|F1|CEO|FAQ|Q&A|BBQ|KPOP|SUV)\b/g, "")) },
  { key: "brackets", label: "Brackets or parentheses", hint: "(Part 2), [4K], (ft. ...)", test: (t) => /[\[\(][^\]\)]{1,30}[\]\)]/.test(t) },
  { key: "separator", label: "Two-part title", hint: "a colon, pipe or dash splitting the title", test: (t) => /\s[|:–—-]\s|:\s/.test(t) },
  { key: "superlative", label: "Superlative or extreme", hint: "best, worst, biggest, most, ever, insane, ultimate", test: (t) => /\b(best|worst|biggest|smallest|cheapest|most|least|ultimate|insane|craziest|perfect|greatest|ever|fastest|hardest|easiest)\b/i.test(t) },
  { key: "negative", label: "Negative / warning", hint: "don't, never, stop, mistake, wrong, avoid, fail", test: (t) => /\b(don't|dont|never|stop|mistakes?|wrong|avoid|fail(ed|s)?|ruin(ed)?|broke|regret|worst|problem|dangerous|scam)\b/i.test(t) },
  { key: "contrast", label: "Comparison / vs", hint: "X vs Y, or 'instead', 'better than'", test: (t) => /\bvs\.?\b|\bversus\b|\binstead\b|\bbetter than\b|\bor\b/i.test(t) },
  { key: "time", label: "Time frame", hint: "24 hours, 30 days, a year, overnight, in 5 minutes", test: (t) => /\b(\d+\s*(hours?|hrs?|days?|weeks?|months?|years?|minutes?|mins?|seconds?)|overnight|a (day|week|month|year))\b/i.test(t) },
  { key: "money", label: "Money", hint: "a $ figure or price language", test: (t) => /[$£€]\s?\d|\b\d+\s?(dollars|bucks|k)\b|\b(free|cheap|expensive|budget|cost)\b/i.test(t) },
  { key: "open_loop", label: "Open loop", hint: "an unfinished thought: ..., 'this', 'what happened', 'until'", test: (t) => /\.\.\.|…|\b(this|what happened|until|then this|here's what|the truth|nobody|no one|secret)\b/i.test(t) },
  { key: "named", label: "Names a product or brand", hint: "a capitalized proper noun that isn't the first word", test: (t) => { const ws = t.split(/\s+/).slice(1); return ws.some((w) => /^[A-Z][a-z]+[A-Za-z0-9]*$/.test(w.replace(/[^A-Za-z0-9]/g, "")) && !/^(I|I'm|I've|The|A|An|And|Or|But|To|In|On|Of|For|With|My|Your|This|That|How|Why|What|Is|It|Vs)$/.test(w.replace(/[^A-Za-z']/g, ""))); } },
  { key: "short", label: "Short (6 words or fewer)", hint: "", test: (t) => words(t) <= 6 },
  { key: "long", label: "Long (11+ words)", hint: "", test: (t) => words(t) >= 11 },
  { key: "emoji", label: "Emoji", hint: "", test: (t) => /\p{Extended_Pictographic}/u.test(t) },
];

export function tagTitle(title: string): string[] { return TITLE_PATTERNS.filter((p) => p.test(title)).map((p) => p.key); }

/** Score every video against its kind's median and build the lift table. Items come back sorted by multiple. */
export function analyzeTitles(videos: TitleVideo[], now = new Date()): TitleAnalysis {
  const cut = now.getTime() - CLIMB_DAYS * 864e5;
  const pre = videos.filter((v) => v.title && v.publishedAt).map((v) => {
    const kind = kindOf(v.durationSeconds, v.title);
    return { v, kind, climbing: new Date(v.publishedAt).getTime() > cut };
  });
  const median_video = median(pre.filter((p) => p.kind === "video" && !p.climbing).map((p) => p.v.views));
  const median_short = median(pre.filter((p) => p.kind === "short" && !p.climbing).map((p) => p.v.views));
  const items: TitleItem[] = pre.map(({ v, kind, climbing }) => {
    const med = kind === "short" ? median_short : median_video;
    return {
      id: v.id, title: v.title, url: `https://www.youtube.com/watch?v=${v.id}`, published_at: v.publishedAt, views: v.views, kind,
      sponsored: !!v.sponsored, mult: med && med > 0 ? round1(v.views / med) : null, climbing, words: words(v.title), tags: tagTitle(v.title),
    };
  }).sort((a, b) => (b.mult ?? -1) - (a.mult ?? -1) || b.views - a.views);

  const patterns = liftTable(items);
  return { items, median_video, median_short, patterns };
}

/** Pattern lift over already-normalised items (settled ones only): median multiple with the pattern ÷ without. */
export function liftTable(items: { tags: string[]; mult: number | null; climbing: boolean; title: string }[], minSide = MIN_SIDE): TitlePattern[] {
  const settled = items.filter((i) => !i.climbing && i.mult != null);
  return TITLE_PATTERNS.map((p) => {
    const w = settled.filter((i) => i.tags.includes(p.key));
    const wo = settled.filter((i) => !i.tags.includes(p.key));
    const wm = medianF(w.map((i) => i.mult as number)); const wom = medianF(wo.map((i) => i.mult as number));
    const ok = w.length >= minSide && wo.length >= minSide && wm != null && wom != null && wom > 0;
    return {
      key: p.key, label: p.label, hint: p.hint, with_n: w.length, without_n: wo.length,
      with_mult: wm == null ? null : round1(wm), without_mult: wom == null ? null : round1(wom),
      lift: ok ? round1((wm as number) / (wom as number)) : null,
      examples: w.slice(0, 3).map((i) => i.title),
    };
  }).filter((p) => p.with_n > 0).sort((a, b) => (b.lift ?? -1) - (a.lift ?? -1));
}

// ── Title Search (topic) ─────────────────────────────────────────
// Videos from many channels, each scored against ITS OWN channel: the median of the channel's
// latest uploads of the same kind when we fetched them, otherwise the channel's lifetime average
// views per video (total views ÷ video count), which is rougher, so it is marked "est".
export interface TopicVideo extends TitleVideo { channelId: string }
export interface TopicChannel { id: string; title: string; handle: string; subs: number; totalViews: number; videoCount: number; thumbnail?: string;
  /** medians of the channel's recent settled uploads, when fetched */
  median_video?: number | null; median_short?: number | null }
export interface TopicItem extends TitleItem {
  channel_id: string; channel_title: string; channel_handle: string; subs: number;
  /** the views figure the multiple is measured against */
  baseline: number | null; baseline_kind: "median" | "average" | null;
}
export const TOPIC_MIN_VIEWS = 3000;
export const kindOf = (durationSeconds: number, title = ""): "video" | "short" => ((durationSeconds > 0 && durationSeconds <= SHORT_SECONDS) || /#shorts?\b/i.test(title) ? "short" : "video");
/** Median views of a channel's settled uploads by kind (used for the refine pass). */
export function channelMedians(videos: TitleVideo[], now = new Date()) {
  const cut = now.getTime() - CLIMB_DAYS * 864e5;
  const settled = videos.filter((v) => new Date(v.publishedAt).getTime() <= cut);
  return { median_video: median(settled.filter((v) => kindOf(v.durationSeconds, v.title) === "video").map((v) => v.views)), median_short: median(settled.filter((v) => kindOf(v.durationSeconds, v.title) === "short").map((v) => v.views)) };
}
export function scoreTopic(videos: TopicVideo[], channels: Map<string, TopicChannel>, now = new Date(), minViews = TOPIC_MIN_VIEWS): TopicItem[] {
  const cut = now.getTime() - CLIMB_DAYS * 864e5;
  const seen = new Set<string>();
  const out: TopicItem[] = [];
  for (const v of videos) {
    if (!v.title || !v.publishedAt || seen.has(v.id)) continue; seen.add(v.id);
    const ch = channels.get(v.channelId); if (!ch) continue;
    const kind = kindOf(v.durationSeconds, v.title);
    const med = kind === "short" ? ch.median_short : ch.median_video;
    const avg = ch.videoCount > 0 ? ch.totalViews / ch.videoCount : 0;
    const baseline = med && med > 0 ? med : avg > 0 ? Math.round(avg) : null;
    const baseline_kind: TopicItem["baseline_kind"] = med && med > 0 ? "median" : avg > 0 ? "average" : null;
    out.push({
      id: v.id, title: v.title, url: kind === "short" ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`, published_at: v.publishedAt, views: v.views, kind,
      sponsored: !!v.sponsored, mult: baseline ? round1(v.views / baseline) : null, climbing: new Date(v.publishedAt).getTime() > cut, words: words(v.title), tags: tagTitle(v.title),
      channel_id: ch.id, channel_title: ch.title, channel_handle: ch.handle, subs: ch.subs, baseline, baseline_kind,
    });
  }
  // tiny videos make silly multiples (300 views on a 20-view channel); they stay out of the ranking
  return out.filter((i) => i.views >= minViews).sort((a, b) => (b.mult ?? -1) - (a.mult ?? -1) || b.views - a.views);
}
/** Titles a US/English reader can use: no non-Latin scripts, no rupee pricing. */
export const isEnglishTitle = (t: string) => !/[\u0400-\u04FF\u0590-\u06FF\u0900-\u0DFF\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(t) && !/₹|\b\d+\s?(lakh|rs)\b|\brs\.?\s?\d|\/-/i.test(t);

/** Keep the ranking from being one channel's playlist: at most `perChannel` items per channel. */
export function capPerChannel<T extends { channel_id: string }>(items: T[], perChannel = 3): T[] {
  const n = new Map<string, number>();
  return items.filter((i) => { const c = (n.get(i.channel_id) || 0) + 1; n.set(i.channel_id, c); return c <= perChannel; });
}

/** The strongest and weakest fifths of the settled titles, for the model read and the UI. */
export function splitTitles(items: TitleItem[], share = 0.2, min = 4, max = 15) {
  const settled = items.filter((i) => !i.climbing && i.mult != null);
  const n = Math.min(max, Math.max(min, Math.round(settled.length * share)));
  return { top: settled.slice(0, n), bottom: settled.slice(-n).reverse(), settled: settled.length };
}
