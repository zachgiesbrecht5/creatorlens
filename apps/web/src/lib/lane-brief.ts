import { openerKey } from "@creatorlens/engine";
import type { LaneDigest, LaneOpener, LaneTopPost } from "@/lib/lane-digest";

// The lane as direction rather than a feed. Three short answers a creator can act on this week:
//   1. openings the lane rewards that THIS creator hasn't used in their last 250 posts;
//   2. subjects the lane's best posts cover that none of this creator's top posts touch;
//   3. the creator's own best, so the comparison is explicit.
// Everything is counted from what was actually said or written; no model, no credits.

export type Topic = { key: string; label: string; re: RegExp };
export const TOPICS: Topic[] = [
  { key: "newborn", label: "newborn & baby", re: /\b(baby|babies|newborn|infant|diaper|bottle|swaddl|crib|bassinet|burp|formula|breast|pacifier|nap time|naps?)\b/i },
  { key: "kids", label: "toddler & kids", re: /\b(toddler|kids?|daughter|son|school|daycare|tantrum|snacks?|playground|bedtime)\b/i },
  { key: "marriage", label: "wife & marriage", re: /\b(wife|husband|marriage|married|date night|anniversary|my girl)\b/i },
  { key: "money", label: "money & budgeting", re: /(\$\s?\d|\b(money|budget|saving|savings|save|cost|paycheck|debt|rent|mortgage|invest|cheap|expensive|price|afford|income|salary)\b)/i },
  { key: "home", label: "house & home projects", re: /\b(house|home|yard|garage|renovat\w*|paint\w*|kitchen|cleaning|organiz\w*|moving|movers|mortgage|backyard|fixing|repair)\b/i },
  { key: "coffee", label: "coffee", re: /\b(coffee|espresso|latte|barista|brew\w*|cafe|café|beans)\b/i },
  { key: "fitness", label: "fitness & health", re: /\b(gym|workout|lift\w*|protein|miles|marathon|running|run|weight|steps|sleep schedule|healthy)\b/i },
  { key: "travel", label: "travel & road trips", re: /\b(trip|travel\w*|flight|hotel|vacation|road trip|airport|airbnb|resort)\b/i },
  { key: "food", label: "cooking & food", re: /\b(recipe|cook\w*|dinner|grill\w*|meal|breakfast|lunch|smoker|bbq|snack)\b/i },
  { key: "work", label: "work & career", re: /\b(job|career|boss|quit|promotion|office|9 to 5|9-5|layoff|side hustle|business)\b/i },
  { key: "making", label: "filmmaking, gear & AI", re: /\b(camera|film\w*|editing|edit|shoot\w*|lens|iphone|ai|chatgpt|app|setup|gear)\b/i },
  { key: "skit", label: "POV & skits", re: /\b(pov|when you|me when|nobody:|skit|every dad|every time)\b/i },
];

export function topicsOf(text: string): string[] {
  const t = String(text || "");
  return TOPICS.filter((x) => x.re.test(t)).map((x) => x.key);
}

export type BriefOpener = LaneOpener & { topics: string[]; stem: string; score: number; fit: "same" | "new" | "off" };
export type BriefGap = { key: string; label: string; lanePosts: number; creators: number; example: LaneTopPost | null };
export type BriefOwn = { line: string; url: string; metric: number; mult: number | null; published_at: string; thumb: string | null; src: string };
export type LaneBrief = {
  tryThis: BriefOpener[];       // openings the lane rewards that the creator hasn't used, best first (up to 8; the UI shows 3)
  gaps: BriefGap[];             // topics in the lane's best that the creator's best don't cover
  own: BriefOwn[];              // the creator's own top 3 by multiple of their median
  ownTopics: string[];
  usedOpeners: number;          // how many lane openings the creator already uses (for the empty state)
};

const lineOf = (t: any) => String(t?.spoken || t?.on_video || t?.on_screen || t?.hook || t?.title || "");

/** The words the group actually shares, shown with an ellipsis so a group isn't mislabelled by one post's full line. */
function stemOf(o: LaneOpener): string {
  const lines = [o.label, ...o.examples.map((e) => e.on_screen || e.hook || e.title)].filter(Boolean).map((l) => String(l).replace(/\s+/g, " ").trim());
  const words = lines.map((l) => l.split(" "));
  let n = 0;
  while (words.every((w) => w[n] && w[n].toLowerCase().replace(/[^\p{L}\p{N}']/gu, "") === words[0][n].toLowerCase().replace(/[^\p{L}\p{N}']/gu, ""))) n++;
  const shared = words[0].slice(0, Math.max(n, o.key.split(" ").length)).join(" ");
  const longest = Math.max(...words.map((w) => w.length));
  return shared.length < lines[0].length && longest > shared.split(" ").length ? `${shared}…` : lines[0];
}

export function laneBrief(digest: LaneDigest, lanePosts: LaneTopPost[], own: { performance: any | null }, opts: { hidden?: Set<string> } = {}): LaneBrief {
  const perf = own.performance || null;
  const median = Number(perf?.median || 0);
  const ownTop: any[] = perf?.top || [];
  // every opening this creator has used: repeated caption openers from the whole print + the first words of their top posts
  const ownKeys = new Set<string>([...((perf?.openers || []) as any[]).map((o) => o.key), ...ownTop.map((t) => openerKey(lineOf(t)))].filter((k) => k && k.split(" ").length >= 2));
  const ownText = [...ownTop.map(lineOf), ...((perf?.openers || []) as any[]).map((o) => o.label)].join(" \n ");
  const ownTopics = new Set(topicsOf(ownText));

  const used = digest.openers.filter((o) => ownKeys.has(o.key)).length;
  // Quality bar: more than one creator, at least three posts, a real lift. Rank by evidence (creators, posts) times a
  // capped multiple, with a bonus when the subject is one the creator already works in and a penalty when it's
  // nothing to do with them. Thumbs-down keys are left out.
  const tryThis: BriefOpener[] = digest.openers
    .filter((o) => !ownKeys.has(o.key) && !opts.hidden?.has(o.key) && o.creators >= 2 && o.posts >= 3 && (o.mult ?? 0) >= 2)
    .map((o) => {
      const topics = topicsOf([o.label, ...o.examples.map((e) => e.on_screen || e.hook || e.title)].join(" \n "));
      const fit: BriefOpener["fit"] = topics.some((t) => ownTopics.has(t)) ? "same" : topics.length ? "new" : "off";
      const score = Math.log(o.posts + 1) * Math.sqrt(o.creators) * Math.log(Math.min(o.mult ?? 1, 50) + 1) * (fit === "same" ? 1.5 : fit === "new" ? 1 : 0.6) * (o.said ? 1.15 : 1);
      return { ...o, topics, stem: stemOf(o), score, fit };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // topics: count lane top posts (one creator counts once per topic) vs the creator's own
  const byTopic = new Map<string, { posts: number; creators: Set<string>; example: LaneTopPost | null }>();
  for (const p of lanePosts) {
    for (const k of topicsOf(lineOf(p.post))) {
      const e = byTopic.get(k) || byTopic.set(k, { posts: 0, creators: new Set(), example: null }).get(k)!;
      e.posts++; e.creators.add(p.creator_id); if (!e.example || (p.score > e.example.score)) e.example = p;
    }
  }
  const gaps: BriefGap[] = TOPICS
    .filter((t) => !ownTopics.has(t.key))
    .map((t) => { const e = byTopic.get(t.key); return { key: t.key, label: t.label, lanePosts: e?.posts || 0, creators: e?.creators.size || 0, example: e?.example || null }; })
    .filter((g) => g.lanePosts >= 3 && g.creators >= 2)
    .sort((a, b) => b.lanePosts - a.lanePosts)
    .slice(0, 3);

  const ownOut: BriefOwn[] = ownTop
    .map((t) => ({ line: lineOf(t), url: t.url, metric: Number(t.metric || 0), mult: median >= 100 ? +(Number(t.metric || 0) / median).toFixed(1) : null, published_at: t.published_at, thumb: t.thumb || null, src: t.audio === "voice" && t.spoken ? "SAID" : t.on_video ? "ON VIDEO" : t.on_screen ? "ON COVER" : "CAPTION" }))
    .sort((a, b) => (b.mult ?? 0) - (a.mult ?? 0) || b.metric - a.metric)
    .slice(0, 3);

  return { tryThis, gaps, own: ownOut, ownTopics: [...ownTopics], usedOpeners: used };
}

/** Size band for the fit filter: accounts between 0.3x and 5x this creator's following, with a floor
 *  so a small creator still sees a real lane. */
export function fitBand(followers: number | null | undefined): { min: number; max: number } | null {
  const f = Number(followers || 0);
  if (!f) return null;
  return { min: Math.max(10_000, Math.round(f * 0.3)), max: Math.round(f * 5) };
}
