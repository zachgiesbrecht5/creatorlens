// Content lanes: the categories a creator's posts are judged by, agreed between the creator and their
// manager. Each post is placed by what was said or written (and the sponsored flag); the manager can
// correct a placement by url. Default set is the one from Jimmy's Oct 6 read; other creators get their
// own list on roster_creators.content_lanes.

export type Lane = { key: string; label: string; pattern: string; job: "growth" | "reach" | "connection" | "commercial" | "test"; note?: string };

export const DEFAULT_LANES: Lane[] = [
  { key: "sponsored", label: "Brand partnerships", pattern: "#ad\\b|paid partnership|#sponsored|#partner\\b|sponsored by", job: "commercial", note: "placed by the sponsored flag first" },
  { key: "lists", label: "Lists and \"things I wish I knew\"", pattern: "\\b\\d+ (things|tips|ways|reasons|mistakes)|\\b(three|four|five|six|seven|ten) (things|tips|ways|reasons|mistakes)|things i wish|wish (i|someone|somebody) (knew|had )|nobody (told|tells)|no ?one (told|tells)|why did nobody|why does no one|send this to", job: "reach" },
  { key: "partner", label: "Partner support", pattern: "\\b(my )?wife|\\bmom\\b|\\bpartner\\b|breast ?milk|pumping|postpartum|new moms?|her recovery|support(ing)? (her|mom)|date night|marriage", job: "growth" },
  { key: "finance", label: "Finance and budgeting", pattern: "\\$\\s?\\d|\\b(money|budget|budgeting|saving|savings|save money|cost of|costs|paycheck|debt|afford|price|income|salary|invest|frugal|cheap|expensive|spend|spending)\\b", job: "test" },
  { key: "registry", label: "Registry opinions", pattern: "registry|worth it|not worth|don'?t buy|overrated|underrated|skip (this|these|it)|waste of money|you (don'?t )?need|must[- ]have|gear|review|gift", job: "connection" },
  { key: "tutorials", label: "First Time Dad tutorials", pattern: "^how (to|i)\\b|\\bhow to\\b|\\bday \\d+\\b|swaddl|burp|diaper|bottle|car seat|hold (a|the|your) baby|pick(ing)? up (a|the|your) (baby|newborn)|lay(ing)? (a|the|your) (sleeping )?baby|suction|bath(e|ing)? (a|the|your) (baby|newborn)|wrong way|three simple tricks|step one|level one|tutorial|here'?s how", job: "growth" },
  { key: "personal", label: "Personal story", pattern: "\\bi (was|felt|never|remember|didn'?t|couldn'?t|used to)\\b|\\bmy (dad|father|own dad|story|childhood)\\b|growing up|the day (i|we|she|he)|became a dad|honest(ly)?|confession|i'?m (so )?tired|she slept|we'?re (so )?tired", job: "connection" },
  { key: "vlog", label: "Vlogs and humor", pattern: ".", job: "reach", note: "everything else" },
];

export function lanesFor(stored: unknown): Lane[] {
  const arr = Array.isArray(stored) ? (stored as any[]).filter((l) => l && l.key && l.label && typeof l.pattern === "string") : [];
  return arr.length ? (arr as Lane[]) : DEFAULT_LANES;
}

/** Place one post. Sponsored wins; then the first lane whose pattern matches the text; else the catch-all. */
export function placePost(text: string, sponsored: boolean, lanes: Lane[], override?: string | null): Lane {
  if (override) { const o = lanes.find((l) => l.key === override); if (o) return o; }
  if (sponsored) { const s = lanes.find((l) => l.key === "sponsored"); if (s) return s; }
  const t = String(text || "").replace(/\s+/g, " ").trim();
  for (const l of lanes) {
    if (l.pattern === ".") continue;
    let re: RegExp; try { re = new RegExp(l.pattern, "i"); } catch { continue; }
    if (re.test(t)) return l;
  }
  return lanes.find((l) => l.pattern === ".") || lanes[lanes.length - 1];
}

export const JOB_LABEL: Record<Lane["job"], string> = { growth: "growth (follows)", reach: "reach (views)", connection: "connection (comments)", commercial: "commercial", test: "a test" };
