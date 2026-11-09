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
const SHORT_SECONDS = 75;

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
    const kind: "video" | "short" = v.durationSeconds > 0 && v.durationSeconds <= SHORT_SECONDS ? "short" : "video";
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

  // Lift is computed on settled long-form + Shorts together, each already normalised to its own median.
  const settled = items.filter((i) => !i.climbing && i.mult != null);
  const patterns: TitlePattern[] = TITLE_PATTERNS.map((p) => {
    const w = settled.filter((i) => i.tags.includes(p.key));
    const wo = settled.filter((i) => !i.tags.includes(p.key));
    const wm = medianF(w.map((i) => i.mult as number)); const wom = medianF(wo.map((i) => i.mult as number));
    const ok = w.length >= MIN_SIDE && wo.length >= MIN_SIDE && wm != null && wom != null && wom > 0;
    return {
      key: p.key, label: p.label, hint: p.hint, with_n: w.length, without_n: wo.length,
      with_mult: wm == null ? null : round1(wm), without_mult: wom == null ? null : round1(wom),
      lift: ok ? round1((wm as number) / (wom as number)) : null,
      examples: w.slice(0, 3).map((i) => i.title),
    };
  }).filter((p) => p.with_n > 0).sort((a, b) => (b.lift ?? -1) - (a.lift ?? -1));
  return { items, median_video, median_short, patterns };
}

/** The strongest and weakest fifths of the settled titles, for the model read and the UI. */
export function splitTitles(items: TitleItem[], share = 0.2, min = 4, max = 15) {
  const settled = items.filter((i) => !i.climbing && i.mult != null);
  const n = Math.min(max, Math.max(min, Math.round(settled.length * share)));
  return { top: settled.slice(0, n), bottom: settled.slice(-n).reverse(), settled: settled.length };
}
