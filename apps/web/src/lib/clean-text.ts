// Masks profanity in lines we display (spoken openings, captions, on-screen text). The post itself is
// untouched and still ranks; only the word is hidden: "fuck" -> "f***". Handles common spellings,
// plurals and -ing/-ed forms. Add to the list rather than loosening the regex.
const WORDS = ["fuck", "fucking", "fucked", "fucker", "fuckers", "motherfucker", "motherfucking", "shit", "shitty", "shits", "bullshit", "bitch", "bitches", "asshole", "assholes", "dick", "dickhead", "cunt", "pussy", "cock", "whore", "slut", "nigga", "nigger", "faggot", "fag", "retard", "retarded", "damn", "goddamn", "piss", "pissed", "bastard", "wtf", "stfu", "af"];
const RE = new RegExp(`\\b(${WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
const SOFT = new Set(["damn", "goddamn", "piss", "pissed", "af"]);

/** Mask swear words, keeping the first letter: "shit" -> "s***". `soft: false` leaves mild ones (damn, piss) alone. */
export function cleanLine(s: string | null | undefined, opts: { soft?: boolean } = {}): string {
  if (!s) return "";
  return String(s).replace(RE, (m) => (opts.soft === false && SOFT.has(m.toLowerCase()) ? m : m[0] + "*".repeat(Math.max(2, m.length - 1))));
}

export function hasProfanity(s: string | null | undefined): boolean {
  if (!s) return false; RE.lastIndex = 0; const hit = RE.test(String(s)); RE.lastIndex = 0; return hit;
}
