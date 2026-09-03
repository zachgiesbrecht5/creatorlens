// Instagram caption detection. Ported from Instagram.gs igDetect_ v7 and
// igGuessBrand_. Pure: caption in, ranked brand findings out.

import { MASS_SPONSOR_BRANDS } from "./aliases";
import { getAliases } from "./registry";

export const IG_PROXIMITY = 120;

export interface IgFinding {
  brand: string;
  type: string;
  score: number;
  label: "High" | "Medium" | "Low";
  evidence: string;
  isMassSponsor: boolean;
}

interface Tier { type: string; score: number; label: "High" | "Medium" | "Low" }

const IG_PATTERNS: { tier: Tier; res: RegExp[] }[] = [
  { tier: { type: "Paid - explicit", score: 8, label: "High" }, res: [
    /#ad\b/gi, /#advert(?:isement)?\b/gi, /#sponsored\b/gi, /#spons\b/gi,
    /paid partnership/gi, /in (?:paid )?partnership with/gi,
    /partner(?:ing|ed)?\s+with/gi, /sponsored by/gi ] },
  { tier: { type: "Affiliate / code", score: 5, label: "Medium" }, res: [
    /use (?:my |the )?code/gi, /(?:promo|discount|coupon) code/gi,
    /code[:\s]+[A-Z0-9]{3,}/g, /affiliate/gi ] },
  { tier: { type: "Gifted / PR", score: 4, label: "Medium" }, res: [
    /gifted/gi, /#gift(?:edby)?\b/gi, /pr (?:package|box|haul|from)/gi, /for sending/gi ] },
  { tier: { type: "Potential partner", score: 2, label: "Low" }, res: [
    /thanks? (?:you )?to/gi, /collab(?:oration|orating)?/gi, /ambassador/gi, /teamed up with/gi ] },
];

const GENERIC: Record<string, 1> = { brand: 1, paid: 1, our: 1, the: 1, my: 1, your: 1, travel: 1, business: 1,
  media: 1, content: 1, creator: 1, official: 1, insta: 1, instagram: 1, fashion: 1,
  workday: 1, unboxing: 1, review: 1, upgrade: 1, office: 1, early: 1, easy: 1,
  asmr: 1, honest: 1, ultimate: 1, finally: 1, obsessed: 1, help: 1, made: 1,
  style: 1, beauty: 1, fitness: 1, food: 1, home: 1, life: 1, love: 1, daily: 1,
  weekend: 1, morning: 1, dream: 1, glow: 1, self: 1, best: 1, real: 1 };

// Real brand names that are also common words: only match when capitalized.
const RISKY: Record<string, 1> = { ring: 1, aura: 1, cozy: 1, prime: 1, glow: 1, pure: 1, bloom: 1,
  halo: 1, luna: 1, nova: 1, mint: 1, honey: 1, sage: 1, dawn: 1, ember: 1 };

interface Evidence { tier: Tier; index: number; length: number }
interface Candidate { key: string; brand: string; idx: number; len: number; self: Tier | null }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function detectInstagram(caption: string | null | undefined, ownHandle?: string): IgFinding[] {
  if (!caption) return [];
  const ALIASES = getAliases();
  const text = String(caption);
  const own = String(ownHandle || "").toLowerCase().replace(/^@/, "");

  const evidences: Evidence[] = [];
  for (const grp of IG_PATTERNS) {
    for (const re of grp.res) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        evidences.push({ tier: grp.tier, index: m.index, length: m[0].length });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }

  const brandFor = (k: string) => ALIASES[k] || cap(k);
  const candidates: Candidate[] = [];

  // Grammar capture: "collaborating with soltech", "partnered with X"
  const pw = /\b(?:collab(?:orat(?:e|ing|ion))?|partner(?:ing|ed|ship)?|team(?:ing|ed)?\s*up|working)\s+(?:with|w\/)\s+[@#]?([A-Za-z][A-Za-z0-9._]{2,30})/gi;
  let pwm: RegExpExecArray | null;
  while ((pwm = pw.exec(text)) !== null) {
    const pname = pwm[1].replace(/[._]+$/, "");
    const plow = pname.toLowerCase().replace(/[._]/g, "");
    if (plow.length < 3 || GENERIC[plow] || plow === own) continue;
    const pdisp = ALIASES[plow] || cap(pname).replace(/[._]/g, " ");
    candidates.push({ key: plow, brand: pdisp, idx: pwm.index, len: pwm[0].length,
      self: { type: "Partner mention", score: 6, label: "Medium" } });
  }

  // "Product from @brand" + commercial context
  const fromRe = /\bfrom\s+@([A-Za-z0-9._]{3,30})/gi;
  const hasCommerce = /link in (?:my )?bio|\$\s?\d|use (?:my )?code|% ?off|shop now/i.test(text);
  let fromM: RegExpExecArray | null;
  while ((fromM = fromRe.exec(text)) !== null) {
    const fh = fromM[1].toLowerCase().replace(/[._]+$/, "");
    if (fh.length < 3 || fh === own) continue;
    const fkey = fh.replace(/[._]/g, "");
    candidates.push({ key: fkey, brand: ALIASES[fkey] || "@" + fh, idx: fromM.index, len: fromM[0].length,
      self: hasCommerce
        ? { type: "Product from @brand + promo", score: 4, label: "Medium" }
        : { type: "Product from @brand", score: 2, label: "Low" } });
  }

  // @handles (need nearby evidence)
  const handleRe = /(^|[^\w@.])@([a-zA-Z0-9](?:[a-zA-Z0-9._]{0,28}[a-zA-Z0-9_])?)/g;
  let hm: RegExpExecArray | null;
  while ((hm = handleRe.exec(text)) !== null) {
    const h = hm[2].toLowerCase().replace(/\.+$/, "");
    if (h.length < 2 || h === own) continue;
    candidates.push({ key: h, brand: ALIASES[h] || "@" + h, idx: hm.index + hm[1].length, len: hm[2].length + 1, self: null });
  }

  // Hashtags carrying brand + disclosure in one token
  const SHAPES: { re: RegExp; self: Tier | null }[] = [
    { re: /#([a-z0-9_.]{2,30}?)_?(?:partner|ambassador)s?\b/gi, self: { type: "Paid - explicit", score: 8, label: "High" } },
    { re: /#createdwith([a-z0-9]{3,30})/gi, self: { type: "Paid - explicit", score: 8, label: "High" } },
    { re: /#([a-z0-9]{3,30}?)crew\b/gi, self: { type: "Community tag", score: 3, label: "Low" } },
    { re: /#team([a-z0-9]{3,30})\b/gi, self: { type: "Community tag", score: 3, label: "Low" } },
    { re: /#([a-z0-9]{3,30}?)squad\b/gi, self: { type: "Community tag", score: 3, label: "Low" } },
    { re: /#my([a-z0-9]{3,30})\b/gi, self: null },
  ];
  for (const s of SHAPES) {
    s.re.lastIndex = 0;
    let sm: RegExpExecArray | null;
    while ((sm = s.re.exec(text)) !== null) {
      const nm = sm[1].toLowerCase().replace(/[._]+$/, "");
      if (nm.length < 3 || GENERIC[nm]) continue;
      candidates.push({ key: nm, brand: brandFor(nm), idx: sm.index, len: sm[0].length, self: s.self });
    }
  }

  // Known brands hiding inside ANY hashtag
  const tagRe2 = /#([a-z0-9_.]{4,40})/gi;
  let tg: RegExpExecArray | null;
  const aliasKeys = Object.keys(ALIASES);
  while ((tg = tagRe2.exec(text)) !== null) {
    const tl = tg[1].toLowerCase();
    for (const ak of aliasKeys) {
      const names2 = [ak.toLowerCase(), String(ALIASES[ak]).toLowerCase()];
      let hit = false;
      for (const n of names2) {
        const lk2 = n.replace(/[^a-z0-9]/g, "");
        if (lk2.length >= 5 && !RISKY[lk2] && tl.includes(lk2)) {
          candidates.push({ key: lk2, brand: String(ALIASES[ak]), idx: tg.index, len: tg[0].length, self: null });
          hit = true; break;
        }
      }
      if (hit) break;
    }
  }

  // Plain-text known brands near evidence
  if (evidences.length) {
    const tried: Record<string, 1> = {};
    for (const ak2 of aliasKeys) {
      for (const n of [ak2, String(ALIASES[ak2])]) {
        const lk3 = n.toLowerCase();
        if (lk3.length < 4 || tried[lk3]) continue;
        tried[lk3] = 1;
        const esc = lk3.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const risky3 = lk3.length <= 4 || !!RISKY[lk3];
        const body3 = risky3 ? cap(esc) : esc;
        const pr = new RegExp("(^|[^\\w@#])(" + body3 + ")\\b", risky3 ? "g" : "gi");
        let pm: RegExpExecArray | null;
        while ((pm = pr.exec(text)) !== null) {
          candidates.push({ key: lk3, brand: String(ALIASES[ak2]), idx: pm.index + pm[1].length, len: pm[2].length, self: null });
        }
      }
    }
  }

  const snip = (aIdx: number, aLen: number) => {
    const s = Math.max(0, aIdx - 20);
    let e = Math.min(text.length, aIdx + aLen + 40);
    if (e - s > 160) e = s + 160;
    return text.substring(s, e).replace(/\s+/g, " ").trim();
  };

  const out: Record<string, { brand: string; type: string; score: number; label: "High" | "Medium" | "Low"; evidence: string }> = {};
  for (const cand of candidates) {
    let chosen: Tier | null = null;
    let aIdx = cand.idx, aLen = cand.len;
    if (cand.self) {
      chosen = cand.self;
    } else {
      if (!evidences.length) continue;
      let minDist = Infinity;
      for (const e of evidences) {
        const d = Math.abs(cand.idx - e.index);
        if (d <= IG_PROXIMITY && d < minDist) minDist = d;
      }
      if (minDist === Infinity) continue;
      let best: Evidence | null = null;
      for (const e of evidences) {
        const d = Math.abs(cand.idx - e.index);
        if (d <= IG_PROXIMITY && d <= minDist + 25 && (!best || e.tier.score > best.tier.score)) best = e;
      }
      if (!best) continue;
      chosen = best.tier;
      aIdx = Math.min(cand.idx, best.index);
      aLen = Math.max(cand.idx + cand.len, best.index + best.length) - aIdx;
    }
    const key = cand.brand.toLowerCase();
    if (!out[key] || chosen.score > out[key].score) {
      out[key] = { brand: cand.brand, type: chosen.type, score: chosen.score, label: chosen.label, evidence: snip(aIdx, aLen) };
    }
  }

  // Family dedupe + top-3 cap
  const lowText = text.toLowerCase();
  const standalone = (k: string) => {
    let c = 0, p = -1;
    while ((p = lowText.indexOf(k, p + 1)) !== -1) {
      const pb = p === 0 ? "" : lowText.charAt(p - 1);
      const pa = lowText.charAt(p + k.length) || "";
      if (!/[a-z0-9]/.test(pb) && !/[a-z0-9]/.test(pa)) c++;
    }
    return c;
  };
  const keys = Object.keys(out);
  const drop: Record<string, 1> = {};
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i === j) continue;
      const a = keys[i], b = keys[j];
      if (drop[a] || drop[b]) continue;
      if (b.includes(a)) {
        let loser: string;
        if (out[b].score !== out[a].score) loser = out[b].score > out[a].score ? a : b;
        else { const sa = standalone(a), sb = standalone(b); loser = sb > sa ? a : b; }
        drop[loser] = 1;
      }
    }
  }
  let arr = keys.filter((k) => !drop[k]).map((k) => out[k]);
  arr.sort((x, y) => y.score - x.score);
  if (arr.length > 3) arr = arr.slice(0, 3);

  // Fallback: explicit paid disclosure, no known brand
  if (!arr.length) {
    for (const e of evidences) {
      if (e.tier.score >= 8) {
        const guess = guessBrand(text, e.index);
        if (guess) {
          arr.push({ brand: guess + " (?)", type: "Paid - brand guessed (verify)", score: 5, label: "Medium", evidence: snip(e.index, e.length) });
        } else {
          arr.push({ brand: "(unknown - check post)", type: "Paid disclosure, brand unclear", score: 8, label: "High", evidence: snip(e.index, e.length) });
        }
        break;
      }
    }
  }

  const MASS = new Set(MASS_SPONSOR_BRANDS);
  return arr.map((f) => ({ ...f, isMassSponsor: MASS.has(f.brand.toLowerCase().replace(/^@/, "")) }));
}

const GEN: Record<string, 1> = { the: 1, this: 1, that: 1, with: 1, from: 1, your: 1, our: 1, and: 1, for: 1,
  life: 1, love: 1, home: 1, style: 1, daily: 1, living: 1, vibes: 1, mood: 1, ideas: 1,
  inspo: 1, aesthetic: 1, ootd: 1, reels: 1, viral: 1, fyp: 1, explore: 1, trending: 1,
  lifestyle: 1, fashion: 1, beauty: 1, travel: 1, food: 1, fitness: 1, family: 1,
  winning: 1, happens: 1, here: 1, way: 1, of: 1, new: 1, best: 1, real: 1, one: 1,
  partner: 1, ambassador: 1, sponsored: 1, gifted: 1, collab: 1, giveaway: 1,
  monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1,
  january: 1, february: 1, march: 1, april: 1, may: 1, june: 1, july: 1, august: 1,
  september: 1, october: 1, november: 1, december: 1, thanks: 1, thank: 1, link: 1,
  bio: 1, shop: 1, code: 1, use: 1, get: 1, off: 1, sale: 1, discount: 1,
  canada: 1, america: 1, united: 1, states: 1, miami: 1, toronto: 1, vancouver: 1,
  venice: 1, paris: 1, london: 1, tokyo: 1, imagine: 1, everyone: 1, today: 1,
  tomorrow: 1, yesterday: 1, weekend: 1, morning: 1, evening: 1, night: 1,
  summer: 1, winter: 1, spring: 1, autumn: 1, happy: 1, hello: 1, check: 1,
  watch: 1, video: 1, episode: 1, favourite: 1, favorite: 1 };

/** Best-effort brand guess when explicit paid language exists but no brand matched. */
export function guessBrand(text: string, evIdx: number): string {
  const cands: { name: string; idx: number; rank: number }[] = [];

  const hre = /(^|[^\w@#.])([a-z0-9]{3,}[._][a-z0-9]{2,}[a-z0-9._]*)/gi;
  let hm2: RegExpExecArray | null;
  while ((hm2 = hre.exec(text)) !== null) {
    const base = hm2[2].toLowerCase().replace(/[._]+(beauty|official|us|usa|uk|global|hq|shop|store)$/, "").replace(/[._]+/g, "");
    if (base.length >= 4 && !GEN[base]) cands.push({ name: cap(base), idx: hm2.index, rank: 1 });
  }

  const tre = /#([A-Za-z0-9_]{2,40})/g;
  let tm2: RegExpExecArray | null;
  while ((tm2 = tre.exec(text)) !== null) {
    const tag = tm2[1];
    const low = tag.toLowerCase();
    if (/^(ad|ads|sponsored|advert(ising)?|paid|partner|ambassador|gifted|pr)$/.test(low)) continue;
    const words: string[] = tag.match(/[A-Z][a-z0-9]+|[A-Z]{2,}(?![a-z])|^[a-z0-9]+/g) || [];
    if (words.length >= 2) {
      const first = words[0]!.toLowerCase();
      if (!GEN[first] && first.length >= 3) cands.push({ name: words[0]!, idx: tm2.index, rank: 2 });
      else { const joined = words.join(" "); if (joined.length >= 6) cands.push({ name: joined, idx: tm2.index, rank: 4 }); }
    } else if (/^[A-Z0-9]{2,8}$/.test(tag)) {
      cands.push({ name: tag, idx: tm2.index, rank: 3 });
    } else if (/^[a-z0-9]{5,}$/.test(low) && !GEN[low]) {
      let generic = false;
      for (const gk of Object.keys(GEN)) { if (gk.length >= 3 && low.includes(gk)) { generic = true; break; } }
      if (!generic) cands.push({ name: cap(low), idx: tm2.index, rank: 5 });
    }
  }

  const wordsAll = text.match(/\b[A-Za-z][a-z0-9]+\b/g) || [];
  let capCount = 0;
  for (const w of wordsAll) if (/^[A-Z]/.test(w)) capCount++;
  const titleCased = wordsAll.length >= 6 && capCount / wordsAll.length > 0.5;
  const rre = /\b([A-Z][a-z0-9]{2,})(?:\s+[A-Z][a-z0-9]+){1,3}\b/g;
  let rrm: RegExpExecArray | null;
  while (!titleCased && (rrm = rre.exec(text)) !== null) {
    const rw = rrm[1];
    if (GEN[rw.toLowerCase()] || /^(The|My|Our|Your|This|That|New|Happy|Merry|Black|Cyber)$/.test(rw)) continue;
    cands.push({ name: rw, idx: rrm.index, rank: 2 });
  }

  const cre = /([^.!?\n]\s)([A-Z][a-z]{2,})\b/g;
  let cm2: RegExpExecArray | null;
  while ((cm2 = cre.exec(text)) !== null) {
    const w = cm2[2];
    if (GEN[w.toLowerCase()] || /^(I|Im|Ive|The|My|We|You|He|She|It|They|If|So|But|And|Or)$/.test(w)) continue;
    const reps = (text.match(new RegExp("\\b" + w + "\\b", "g")) || []).length;
    if (reps >= 2 && Math.abs(cm2.index - evIdx) <= 120) cands.push({ name: w, idx: cm2.index, rank: 4 });
  }

  if (!cands.length) return "";
  cands.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : Math.abs(a.idx - evIdx) - Math.abs(b.idx - evIdx)));
  return cands[0].name;
}
