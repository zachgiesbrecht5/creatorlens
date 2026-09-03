// Mutable alias registry. The static pack ships with the engine; the worker
// merges "learned" aliases (brands confirmed 5+ times across the database)
// before each scan, exactly like ensureLearnedAliases_ did in Apps Script.

import { STATIC_ALIASES } from "./aliases";

let ALIASES: Record<string, string> = { ...STATIC_ALIASES };

export function getAliases(): Record<string, string> {
  return ALIASES;
}

export function lookupAlias(key: string): string | undefined {
  return ALIASES[key];
}

/** Merge learned aliases. Existing entries always win. */
export function addLearnedAliases(extra: Record<string, string>): number {
  let added = 0;
  for (const k of Object.keys(extra)) {
    const key = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key.length >= 4 && !ALIASES[key]) {
      ALIASES[key] = extra[k];
      added++;
    }
  }
  return added;
}

/** Reset to the static pack (tests). */
export function resetAliases(): void {
  ALIASES = { ...STATIC_ALIASES };
}

// Names that must never be learned as brands even when they show up often.
const NEVER_LEARN =
  /^(home|learn|life|live|love|style|beauty|world|today|magic|dream|light|smart|prime|play|game|games|studio|media|group|team|club|shop|store|brand|daily|first|best|good|great|real|true|next|plus|core|pure|peak|edge|flow|zone|wave|link|water|coffee|house|works|labs?|https?|www|deals?|amazon|blackfriday|newarrival|desksetup|upgrade|espresso|machine|ultimate|office|night|premium|series|trend|problem|empty|workday|ban|meta|glasses|setup|chair|keys|alto)$/i;

/**
 * Decide whether a confirmed brand may be learned as an alias.
 * Volume gate: single-word names need 5+ deals, multi-word 3+.
 */
export function isLearnable(name: string, dealCount: number): boolean {
  const n = name.trim();
  if (!n || n.startsWith("(") || n.startsWith("@")) return false;
  if (/ \(\?\)$/.test(n)) return false;
  const isSingle = !n.includes(" ");
  if (dealCount < (isSingle ? 5 : 3)) return false;
  if (NEVER_LEARN.test(n)) return false;
  return n.toLowerCase().replace(/[^a-z0-9]/g, "").length >= 4;
}
