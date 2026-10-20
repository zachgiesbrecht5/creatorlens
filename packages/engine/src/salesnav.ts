// LinkedIn Sales Navigator rows: cleaning, scoring and email classification.
// Shared by the web ingest route, the worker enrichment job and the tests.

/** Lowercased alphanumeric company key, same shape as brands.key. */
export function companyKey(name: string | null | undefined): string {
  return String(name || "").toLowerCase().replace(/\b(the|inc|llc|ltd|limited|co|corp|corporation|company|plc|gmbh|group|holdings|brands)\b/g, "").replace(/[^a-z0-9]/g, "");
}

const CREDENTIALS = /\b(mba|cpa|phd|ph\.d|md|jd|cfa|pmp|shrm-cp|shrm-scp|sphr|phr|cmo|msc|ma|bsc|ba|rn|esq|cissp|csm|leed ap)\b\.?/gi;

/** Strip emoji, pronouns, credentials and Sales Nav noise from a display name. */
export function cleanPersonName(raw: string | null | undefined): string {
  let s = String(raw || "");
  s = s.replace(/is reachable|1st degree connection|2nd degree connection|3rd degree connection/gi, " ");
  s = s.replace(/\((?:she|he|they)[^)]*\)/gi, " ").replace(/\b(?:she|he|they)\/(?:her|him|them)(?:\/\w+)?\b/gi, " ");
  s = s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, " ");
  s = s.replace(/[|•·].*$/, " ");                 // "Jane Doe | Brand Marketing"
  s = s.split(",")[0];                              // "Jane Doe, MBA"
  s = s.replace(CREDENTIALS, " ");
  s = s.replace(/[^\p{L}\p{M}'.\- ]/gu, " ").replace(/\s+/g, " ").trim();
  return s.split(" ").map((w) => (w.length > 1 && w === w.toUpperCase() && !/\./.test(w) ? w[0] + w.slice(1).toLowerCase() : w)).join(" ");
}

/** First / last name. Last name is null when Sales Nav hides it ("Michael T."). */
export function splitName(full: string): { first: string | null; last: string | null; partial: boolean } {
  const parts = full.split(" ").filter(Boolean);
  if (!parts.length) return { first: null, last: null, partial: true };
  const first = parts[0];
  const lastRaw = parts.length > 1 ? parts[parts.length - 1] : null;
  const partial = !lastRaw || /^\p{L}\.?$/u.test(lastRaw);
  return { first, last: partial ? null : lastRaw, partial };
}

/** "1.5K+ employees" -> 1500, "126 employees" -> 126, "11-50" -> 50. */
export function parseEmployees(raw: string | null | undefined): number | null {
  const s = String(raw || "").replace(/,/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*([KkMm])?\s*\+?\s*(?:[-–]\s*(\d+(?:\.\d+)?)\s*([KkMm])?)?/);
  if (!m) return null;
  const mult = (u?: string) => (u ? (u.toLowerCase() === "k" ? 1e3 : 1e6) : 1);
  const lo = Number(m[1]) * mult(m[2]);
  const hi = m[3] ? Number(m[3]) * mult(m[4] || m[2]) : null;
  return Math.round(hi ?? lo);
}

/** Pull "$10M - $50M" style revenue out of card text, if Sales Nav showed it. */
export function parseRevenue(text: string | null | undefined): string | null {
  const m = String(text || "").match(/\$\s?\d[\d.,]*\s?[KMBT]?\s?(?:[-–]|to)\s?\$?\s?\d[\d.,]*\s?[KMBT]?(?:\+)?/i) || String(text || "").match(/\$\s?\d[\d.,]*\s?[KMBT]\+/i);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

const SIGNAL_GOOD = /(hiring|expansion|expand|launch|new product|funding|raised|growth|grow|acquisition|rebrand|partnership|campaign|marketing|brand awareness|community|sustainab|retail|e-?commerce|dtc|direct to consumer|holiday|seasonal|store opening)/i;
const SIGNAL_BAD = /(layoff|restructur|cost cut|bankrupt|downsiz|closing|closure)/i;

/** 1 to 5 priority for an account: does it look like it has money and a reason to spend it now? */
export function scoreAccount(a: { employees_n?: number | null; hiring?: boolean | null; signals?: string[] | null; revenue?: string | null; industry?: string | null; in_index_deals?: number | null }): { score: number; why: string[] } {
  let s = 1; const why: string[] = [];
  if (a.in_index_deals && a.in_index_deals > 0) { s += 2; why.push(`pays creators (${a.in_index_deals} deal${a.in_index_deals === 1 ? "" : "s"} in Sponsorprint)`); }
  if (a.hiring) { s += 1; why.push("hiring now"); }
  const sig = (a.signals || []).join(" · ");
  if (sig && SIGNAL_GOOD.test(sig)) { s += 1; why.push(`signal: ${(a.signals || []).find((x) => SIGNAL_GOOD.test(x))}`); }
  if (sig && SIGNAL_BAD.test(sig)) { s -= 1; why.push("cost-cutting signal"); }
  const n = a.employees_n || 0;
  if (n >= 50 && n <= 10000) { s += 1; why.push("budget-size headcount"); } else if (n > 0 && n < 10) { s -= 1; why.push("very small team"); }
  if (/non-?profit|government|hospital|health care|education|staffing|recruit/i.test(a.industry || "")) { s -= 1; why.push("unlikely creator buyer"); }
  return { score: Math.max(1, Math.min(5, s)), why };
}

/** How relevant is this title to a creator-partnership pitch? 0 = skip, 3 = ideal. */
export function titleRelevance(title: string | null | undefined): number {
  const t = String(title || "").toLowerCase();
  if (!t) return 0;
  if (/\b(intern|recruit|talent acquisition|qa|quality|engineer|developer|accountant|finance|cfo|coo|cto|legal|counsel|it |supply chain|logistics|warehouse|payroll|hr\b|human resources)\b/.test(t)) return 0;
  if (/influencer|creator|partnership|ambassador|talent|social media|social|brand partnerships|affiliate|collab/.test(t)) return 3;
  if (/brand|marketing|cmo|growth|pr\b|public relations|communications|comms|content|community|campaign|media/.test(t)) return 2;
  if (/founder|owner|president|ceo|head of|director|vp|vice president|gm|general manager/.test(t)) return 1;
  return 0;
}

const GENERIC = /^(info|hello|hi|contact|support|help|sales|admin|office|team|customerservice|customercare|service|care|orders|press|media|careers|jobs|hr|privacy|legal|billing|accounts|marketing|pr|partnerships|partners|collab|collabs|influencers?|creators?|ambassadors?)$/;

/** Bucket a Hunter email for the account view. */
export function classifyEmail(e: { value: string; position?: string | null; department?: string | null }): "partnerships" | "marketing" | "general" | "other" {
  const local = e.value.split("@")[0].toLowerCase();
  const pos = String(e.position || "").toLowerCase();
  if (/partner|influenc|creator|collab|ambassador|affiliate/.test(local) || /partner|influenc|creator|collab|ambassador|affiliate/.test(pos)) return "partnerships";
  if (/marketing|brand|social|pr\b|communications|content|growth/.test(pos) || e.department === "marketing" || e.department === "communication") return "marketing";
  if (GENERIC.test(local.replace(/[^a-z]/g, ""))) return "general";
  return "other";
}

export const isGenericInbox = (email: string) => GENERIC.test(email.split("@")[0].toLowerCase().replace(/[^a-z]/g, ""));

/** Sales Nav people search at one company, filtered to Marketing (function 15). */
export function salesNavPeopleAtCompany(liCompanyId: string, opts: { function?: "marketing" | "any" } = {}) {
  const org = `urn%3Ali%3Aorganization%3A${encodeURIComponent(liCompanyId)}`;
  const company = `(type%3ACURRENT_COMPANY%2Cvalues%3AList((id%3A${org}%2CselectionType%3AINCLUDED)))`;
  const fn = opts.function === "any" ? "" : `%2C(type%3AFUNCTION%2Cvalues%3AList((id%3A15%2Ctext%3AMarketing%2CselectionType%3AINCLUDED)))`;
  return `https://www.linkedin.com/sales/search/people?query=(filters%3AList(${company}${fn}))`;
}

export type SalesNavPersonIn = { lead_id: string; name: string; title?: string | null; company?: string | null; company_id?: string | null; location?: string | null; degree?: string | null; tenure?: string | null; about?: string | null; photo?: string | null };
export type SalesNavAccountIn = { company_id: string; name: string; industry?: string | null; employees?: string | null; location?: string | null; about?: string | null; signals?: string[] | null; hiring?: boolean | null; revenue?: string | null; logo?: string | null; text?: string | null };
