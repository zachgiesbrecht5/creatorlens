// YouTube sponsorship detection. Ported from Code.gs (Scanner v3 engine):
// scoreSignals, extractBrands (methods 1-7), cleanBrandCapture,
// normalizeBrandName, filters, and the dynamic self-reference check.

import { JUNK_DOMAINS, MASS_SPONSOR_BRANDS } from "./aliases";
import { getAliases, lookupAlias } from "./registry";

export interface Signals {
  score: number;
  reasons: string[];
}

export interface BrandCandidate {
  name: string;
  score: number;
  evidence: string;
}

export interface Detection {
  brand: string;
  confidenceScore: number;
  confidenceLabel: "High" | "Medium" | "Low";
  signals: string;
  evidence: string;
  isMassSponsor: boolean;
}

const JUNK_SET = new Set(JUNK_DOMAINS);
const MASS_SET = new Set(MASS_SPONSOR_BRANDS);

const SOCIAL_PLATFORMS = new Set([
  "youtube", "instagram", "tiktok", "facebook", "twitter",
  "pinterest", "reddit", "snapchat", "linkedin", "threads",
  "patreon", "spotify", "amazon", "google", "apple",
  "youtu", "goo", "amzn", "tinyurl", "bitly", "bit",
  "linktr", "ko-fi", "buymeacoffee", "paypal", "venmo",
  "twitch", "streamlabs", "discord",
]);

const COMMON_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "your", "have",
  "more", "about", "what", "when", "where", "which", "their", "been",
  "will", "each", "make", "like", "just", "over", "take", "than",
  "very", "some", "also", "then", "well", "much", "click", "link",
  "below", "above", "video", "subscribe", "channel", "watch", "follow",
  "episode", "today", "new", "best", "how", "get", "use", "code",
  "check", "out", "try", "we", "partners", "sponsors", "sponsor",
  "partner", "brand", "brands", "creator", "creators", "content",
  "music", "camera", "gear", "shop", "store", "buy", "sale",
  "discount", "free", "first", "last", "next", "here", "there",
  "good", "great", "amazing", "day", "week", "month", "year",
  "vlog", "review", "tutorial", "guide", "tips",
]);

export function isJunkBrand(name: string): boolean {
  const n = name.toLowerCase().trim();
  return JUNK_SET.has(n) || JUNK_SET.has(n.replace(/[^a-z0-9]/g, ""));
}

export function isSocialPlatformDomain(domain: string): boolean {
  return SOCIAL_PLATFORMS.has(domain);
}

export function isCommonWord(word: string): boolean {
  const lw = word.toLowerCase();
  if (COMMON_WORDS.has(lw)) return true;
  if (word.length < 3) return true;
  if (/^\d+$/.test(word)) return true;
  return false;
}

export function isMassSponsor(normalizedLower: string): boolean {
  return MASS_SET.has(normalizedLower);
}

// ── Signal scoring ──────────────────────────────────────────

export function scoreSignals(text: string): Signals {
  const lower = text.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (/#ad\b/.test(lower) || /#sponsored\b/.test(lower) || /#partner\b/.test(lower) || /#brandpartner\b/.test(lower)) {
    score += 4; reasons.push("Hashtag Disclosure");
  }
  if (/this\s+(video|episode|content)\s+is\s+sponsored\s+by/.test(lower) || /paid\s+partnership/.test(lower) || /paid\s+promotion/.test(lower)) {
    score += 5; reasons.push("Explicit Sponsorship");
  }
  if (/sponsored\s+by/.test(lower) || /brought\s+to\s+you\s+by/.test(lower) || /presented\s+by/.test(lower)) {
    score += 4; reasons.push("Sponsorship Mention");
  }
  if (/thanks?\s+to\s+.{1,40}\s+for\s+(sponsoring|partnering|supporting|making)/.test(lower)) {
    score += 4; reasons.push("Thank You Sponsorship");
  }
  if (/use\s+(code|my\s+code)|promo\s+code|discount\s+code/.test(lower)) {
    score += 2; reasons.push("Discount Code");
  }
  if (/in\s+collaboration\s+with|partnered\s+with|in\s+partnership\s+with/.test(lower)) {
    score += 3; reasons.push("Collaboration");
  }
  if (/affiliate/.test(lower) || /commission/.test(lower)) {
    score += 1; reasons.push("Affiliate");
  }
  if (/sent\s+(me|us|this|over)|provided\s+by|gifted\s+by|supplied\s+by|sample\s+from|courtesy\s+of|received\s+.{1,30}\s+from/.test(lower)) {
    score += 3; reasons.push("Product Seeding");
  }
  if (/check\s+out\s+the\s+.{1,40}(?:link|below|here)/.test(lower) && /#ad\b|sponsor|partner/i.test(lower)) {
    score += 1; reasons.push("CTA + Disclosure");
  }
  return { score, reasons };
}

// ── Brand extraction (methods 1-7) ──────────────────────────

const STOP_WORDS = [" and ", " for ", " to ", " with ", " by ", " in ", " on ",
  " at ", " the ", " is ", " are ", " was ", " has ", " our ", " my ",
  " your ", " below ", " above ", " using ", " link ", " get ", " who ",
  " that ", " this ", " so ", " we ", " you "];

export function cleanBrandCapture(raw: string | undefined): string {
  if (!raw) return "";
  let name = raw.trim().replace(/\s+/g, " ");
  for (const sw of STOP_WORDS) {
    const idx = name.toLowerCase().indexOf(sw);
    if (idx > 0) name = name.substring(0, idx).trim();
  }
  name = name.replace(/[.!,;:]+$/, "").trim();
  // URL fragments that leak into captures: "Provided by https", "Board https",
  // "Commission www.egyptf". Strip them; if nothing meaningful is left, drop it.
  name = name.replace(/\s*\b(?:https?|www\.?\S*)$/i, "").trim();
  name = name.replace(/\s+(?:and|the|of|at|by|for|to|with)$/i, "").trim();
  if (/^(?:https?|www|http|my friends|the team|our friends)$/i.test(name)) return "";
  if (name.length < 2 || name.length > 40) return "";
  if (isCommonWord(name)) return "";
  return name;
}

export function normalizeBrandName(name: string): string {
  if (!name) return "";
  const cleaned = name.toLowerCase().trim()
    .replace(/^www\./, "")
    .replace(/\.(com|co|io|org|net)$/, "")
    .replace(/[^\w\s&'\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const alias = lookupAlias(cleaned);
  if (alias) return alias;
  return cleaned.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const URL_RE = /(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]{1,25})\.(?:com|co|io|org|net)(?:\/\S*)?/gi;
const domainOf = (u: string) => u.replace(/https?:\/\//, "").replace(/^www\./, "").split(".")[0];

export function extractBrands(fullText: string, description: string): BrandCandidate[] {
  const brands: BrandCandidate[] = [];
  const seen: Record<string, boolean> = {};
  const aliases = getAliases();

  // METHOD 1: explicit sponsor grammar
  const explicitPatterns: { re: RegExp; score: number }[] = [
    { re: /(?:[Tt]hank\s+[Yy]ou,?\s+(?:[Tt]o\s+)?|[Tt]hanks,?\s+(?:[Tt]o\s+)?)([A-Z0-9][A-Za-z0-9\s&:'!.\-]{1,40}?)\s+for\s+(?:sponsoring|supporting|partnering|sending)/g, score: 5 },
    { re: /(?:sponsored|partnered?)\s+(?:by|with)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 4 },
    { re: /(?:thanks?\s+to)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})\s+(?:for|who|!)/gi, score: 4 },
    { re: /(?:brought\s+to\s+you\s+by|presented\s+by)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 4 },
    { re: /(?:video|episode|content)\s+(?:is\s+)?(?:sponsored|brought\s+to\s+you|presented)\s+(?:by|with)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 5 },
    { re: /in\s+collaboration\s+with\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 3 },
    { re: /(?:sent|provided|gifted|supplied)\s+(?:by|from)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 3 },
    { re: /(?:courtesy\s+of)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 3 },
    { re: /(?:received\s+(?:this|a|the)\s+.{0,20}\s+from)\s+([A-Za-z][A-Za-z0-9\s&'.\-]{1,35})/gi, score: 3 },
  ];
  for (const p of explicitPatterns) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(fullText)) !== null) {
      const name = cleanBrandCapture(m[1]);
      if (name && !seen[name.toLowerCase()]) {
        seen[name.toLowerCase()] = true;
        brands.push({ name, score: p.score, evidence: m[0].trim().substring(0, 120) });
      }
    }
  }

  // METHOD 2: sponsor lines + URLs in the next two lines
  const lines = description.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const ll = line.toLowerCase();
    if (line.length < 5 || line.length > 500) continue;
    const isSponsorLine = ["sponsor", "thanks to", "brought to you", "partnered with",
      "paid partnership", "presented by", "in collaboration with", "supported by", "#ad",
      "use code", "promo code", "discount code", "sent by", "provided by", "gifted by",
      "courtesy of", "supplied by", "sent me", "sent us", "sent this"].some((k) => ll.includes(k));
    if (!isSponsorLine) continue;
    let urlLines = line;
    if (i + 1 < lines.length) urlLines += " " + lines[i + 1];
    if (i + 2 < lines.length) urlLines += " " + lines[i + 2];
    const urls = urlLines.match(URL_RE);
    if (!urls) continue;
    for (const u of urls) {
      const domain = domainOf(u);
      const dl = domain.toLowerCase();
      if (domain && !seen[dl] && !isJunkBrand(dl)) {
        seen[dl] = true;
        brands.push({ name: domain, score: 3, evidence: line.substring(0, 120) });
      }
    }
  }

  // METHOD 3: brand URL with a creator-style path, in sponsor context
  const hasSponsorContext = /#ad\b|#sponsored\b|sponsor|brought to you|presented by|use code|promo code|discount code|partnered with/i.test(fullText);
  if (hasSponsorContext) {
    const re = /(?:https?:\/\/)?([a-z][a-z0-9-]{1,25})\.(?:com|co|io|org|net)\/([a-z][a-z0-9_-]{2,30})/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fullText)) !== null) {
      const d = m[1].toLowerCase();
      const path = m[2].toLowerCase();
      if (path.length >= 3 && path.length <= 25 && !isJunkBrand(d) && !isSocialPlatformDomain(d) && !seen[d]) {
        seen[d] = true;
        brands.push({ name: d, score: 2, evidence: m[0].substring(0, 120) });
      }
    }
  }

  // METHOD 4: discount code grammar with an inline domain
  const codePatterns = [
    /(?:use\s+(?:code|my\s+code)\s+\S+\s+(?:at|on|with)\s+)([a-z][a-z0-9-]+)\.(?:com|co|io)/gi,
    /(?:visit|go\s+to|check\s+out)\s+([a-z][a-z0-9-]+)\.(?:com|co|io)(?:\/\S+)?\s+.*?(?:use\s+code|promo)/gi,
  ];
  for (const re of codePatterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fullText)) !== null) {
      const b = m[1].toLowerCase();
      if (b && !seen[b] && !isJunkBrand(b)) {
        seen[b] = true;
        brands.push({ name: b, score: 3, evidence: m[0].trim().substring(0, 120) });
      }
    }
  }

  // METHOD 5: top-of-description links
  const topLines = description.split("\n").slice(0, 8);
  for (const raw of topLines) {
    const topLine = raw.trim();
    if (topLine.length < 5) continue;
    const urls = topLine.match(URL_RE);
    if (!urls) continue;
    for (const u of urls) {
      const d = domainOf(u).toLowerCase();
      if (d && !seen[d] && !isJunkBrand(d) && !isSocialPlatformDomain(d)) {
        const hasCreatorPath = /\.[a-z]{2,3}\/[a-z][a-z0-9_-]{2,25}$/i.test(u);
        const lineHasCode = /code|%\s*off|discount|coupon|free/i.test(topLine);
        seen[d] = true;
        brands.push({ name: d, score: hasCreatorPath ? 3 : lineHasCode ? 3 : 2, evidence: topLine.substring(0, 120) });
      }
    }
  }

  // METHOD 6: discount lines without inline "at brand.com"
  const descLines = description.split("\n");
  for (let dl = 0; dl < descLines.length; dl++) {
    const dLine = descLines[dl].trim();
    if (!/use\s+code|%\s*off|discount|coupon/i.test(dLine.toLowerCase())) continue;
    let ctx = dLine;
    if (dl + 1 < descLines.length) ctx += " " + descLines[dl + 1];
    if (dl + 2 < descLines.length) ctx += " " + descLines[dl + 2];
    const urls = ctx.match(URL_RE);
    if (!urls) continue;
    for (const u of urls) {
      const d = domainOf(u).toLowerCase();
      if (d && !seen[d] && !isJunkBrand(d) && !isSocialPlatformDomain(d)) {
        seen[d] = true;
        brands.push({ name: d, score: 3, evidence: dLine.substring(0, 120) });
      }
    }
  }

  // METHOD 7: hashtags, STRICT (known alias or #XPartner / #XAmbassador / #XCrew)
  const hashtags = fullText.match(/#([A-Za-z][A-Za-z0-9]{2,25})/g);
  if (hashtags) {
    for (const h of hashtags) {
      const htName = h.substring(1);
      const htLower = htName.toLowerCase();
      if (seen[htLower]) continue;
      if (isCommonWord(htName)) continue;
      if (isJunkBrand(htLower)) continue;
      const pShape = htLower.match(/^([a-z0-9]{3,})(partner|ambassador|crew)$/);
      if (pShape && !aliases[htLower]) {
        const core = pShape[1];
        if (!seen[core] && !isCommonWord(core) && !isJunkBrand(core)) {
          seen[core] = true;
          brands.push({ name: aliases[core] || cleanBrandCapture(core), score: 4, evidence: "#" + htName + " (partner-style hashtag)" });
        }
        continue;
      }
      if (!aliases[htLower]) continue;
      seen[htLower] = true;
      brands.push({ name: aliases[htLower], score: 2, evidence: "#" + htName + " (hashtag in description)" });
    }
  }

  return brands;
}

// ── Self-reference filter ───────────────────────────────────

export type SelfKeys = Record<string, boolean>;

export function buildSelfRefKeys(channelTitle: string, channelHandle: string): SelfKeys {
  const keys: SelfKeys = {};
  const add = (s: string) => {
    const k = (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (k.length >= 3) keys[k] = true;
  };
  add(channelTitle);
  add((channelHandle || "").replace(/^@/, ""));
  const words = (channelTitle || "").split(/\s+/);
  if (words.length > 1) add(words.join(""));
  if (words.length > 0 && words[0].length >= 4) add(words[0]);
  return keys;
}

export function isSelfRef(normalizedLower: string, selfKeys: SelfKeys): boolean {
  const k = normalizedLower.replace(/[^a-z0-9]/g, "");
  if (!k) return false;
  if (selfKeys[k]) return true;
  for (const key of Object.keys(selfKeys)) {
    if (key.length >= 5 && (k.indexOf(key) === 0 || key.indexOf(k) === 0)) return true;
  }
  return false;
}

// ── Per-video pipeline ──────────────────────────────────────

export interface VideoInput {
  title: string;
  description: string;
  tags?: string[];
}

/** Full detection for one video: signals + brands, normalized and filtered. */
export function detectYouTube(video: VideoInput, selfKeys: SelfKeys = {}): Detection[] {
  const fullText = (video.title || "") + "\n" + (video.description || "") + "\n" + (video.tags || []).join(" ");
  const signals = scoreSignals(fullText);
  const brands = extractBrands(fullText, video.description || "");
  const out: Detection[] = [];
  const seenPerVideo: Record<string, boolean> = {};
  for (const b of brands) {
    const normalized = normalizeBrandName(b.name);
    if (!normalized || normalized.length < 2) continue;
    const nl = normalized.toLowerCase();
    if (isJunkBrand(nl)) continue;
    if (isSelfRef(nl, selfKeys)) continue;
    if (seenPerVideo[nl]) continue;
    seenPerVideo[nl] = true;
    const confidence = signals.score + b.score;
    out.push({
      brand: normalized,
      confidenceScore: confidence,
      confidenceLabel: confidence >= 5 ? "High" : confidence >= 3 ? "Medium" : "Low",
      signals: signals.reasons.join(", "),
      evidence: b.evidence,
      isMassSponsor: isMassSponsor(nl),
    });
  }
  return out;
}
