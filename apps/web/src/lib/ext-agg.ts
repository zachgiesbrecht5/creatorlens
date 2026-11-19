import { dealType, trackerBrand, DEAL_TYPE_RANK, BRAND_DISPLAY_ALIAS, type DealType } from "@creatorlens/engine";

export type ExtBrand = { brand: string; type: DealType; category: string | null; deals: number; confidence: string | null; first_seen: string | null; last_seen: string | null; repeat_partner: boolean; mass_sponsor: boolean; evidence_title: string | null; evidence_url: string | null; evidence: string | null; website: string | null };

const LABEL_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nkey = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The brands on one or more creators' prints, read from the deal rows and typed:
 * Sponsored (paid language), Gifted (product sent), Affiliate (referral, code or tracked link),
 * Mention (a bare link or hashtag). Mentions are not deals and are left out unless includeMentions.
 * Junk and self-brands are always left out. Sorted Sponsored first, then newest.
 */
/**
 * Deal rows -> typed brands per creator. Pure, so it can be tested on real rows.
 * Types: Sponsored (paid language), Gifted (product sent), Affiliate (referral, code or tracked link),
 * Mention (a bare link or hashtag). Mentions are not deals and are left out unless includeMentions.
 * Sorted Sponsored first, then newest.
 */
export function aggregateDeals(rows: any[], creators: { id: string; handle: string }[], includeMentions = false): Map<string, ExtBrand[]> {
  const out = new Map<string, ExtBrand[]>();
  const handleOf = new Map(creators.map((c) => [c.id, c.handle]));
  type Agg = ExtBrand & { _score: number; _days: number[]; _urls: Set<string>; _deals: Set<string> };
  const groups = new Map<string, Agg>();
  for (const p of rows) {
    let type = dealType(p.signal_type, p.evidence, handleOf.get(p.creator_id));
    // never drop a row the scanner itself scored as a deal
    if (type === "Mention" && p.confidence_label === "High") type = "Sponsored";
    if (type === "Mention" && p.confidence_label === "Medium") type = "Affiliate";
    // a link through an affiliate network is filed under the network's domain: show the brand behind it
    const via = trackerBrand(p.evidence || "");
    const raw = via ? titleCase(via) : String(p.brands.name);
    const name = BRAND_DISPLAY_ALIAS[nkey(raw)] || raw;
    const renamed = via || name !== raw;
    const key = `${p.creator_id}|${nkey(name)}`;
    const score = DEAL_TYPE_RANK[type] * 100 + Number(p.confidence_score || 0);
    const day = p.published_at ? new Date(p.published_at).getTime() / 86400000 : NaN;
    let g = groups.get(key);
    if (!g) { g = { brand: name, type, category: renamed ? null : p.brands.category, deals: 0, confidence: null, first_seen: null, last_seen: null, repeat_partner: false, mass_sponsor: !!p.brands.is_mass_sponsor, evidence_title: null, evidence_url: null, evidence: null, website: renamed ? null : p.brands.website || null, _score: -1, _days: [], _urls: new Set<string>(), _deals: new Set<string>() }; groups.set(key, g); }
    if (p.content_url) g._urls.add(p.content_url);
    if (!renamed) { if (!g.category) g.category = p.brands.category; if (!g.website) g.website = p.brands.website || null; }
    if (DEAL_TYPE_RANK[type] > DEAL_TYPE_RANK[g.type]) g.type = type;
    if ((LABEL_RANK[p.confidence_label] || 0) > (LABEL_RANK[g.confidence || ""] || 0)) g.confidence = p.confidence_label;
    if (p.published_at) { if (!g.first_seen || p.published_at < g.first_seen) g.first_seen = p.published_at; if (!g.last_seen || p.published_at > g.last_seen) g.last_seen = p.published_at; }
    if (type !== "Mention") { g._deals.add(p.content_url || `row:${g._deals.size}:${p.published_at}`); if (isFinite(day)) g._days.push(day); }
    if (score > g._score) { g._score = score; g.evidence_title = p.content_title; g.evidence_url = p.content_url; g.evidence = p.evidence ? String(p.evidence).replace(/\s+/g, " ").trim().slice(0, 160) : null; }
  }
  // The same sponsor often shows twice: once by name ("Trmnl") and once by its link's domain ("Usetrmnl").
  // Fold the longer name into the shorter when one contains the other and they share a video.
  const byCreator = new Map<string, string[]>();
  for (const key of groups.keys()) { const cid = key.split("|")[0]; (byCreator.get(cid) || byCreator.set(cid, []).get(cid)!).push(key); }
  for (const keys of byCreator.values()) {
    keys.sort((a, b) => a.length - b.length);
    for (let i = keys.length - 1; i > 0; i--) {
      const long = groups.get(keys[i]); const ln = keys[i].split("|")[1]; if (!long) continue;
      const hostKey = keys.slice(0, i).find((k) => { const sn = k.split("|")[1]; const short = groups.get(k); return !!short && sn.length >= 4 && ln.includes(sn) && [...long._urls].some((u) => short._urls.has(u)); });
      if (!hostKey) continue;
      const short = groups.get(hostKey)!;
      if (DEAL_TYPE_RANK[long.type] > DEAL_TYPE_RANK[short.type]) short.type = long.type;
      if ((LABEL_RANK[long.confidence || ""] || 0) > (LABEL_RANK[short.confidence || ""] || 0)) short.confidence = long.confidence;
      if (long.first_seen && (!short.first_seen || long.first_seen < short.first_seen)) short.first_seen = long.first_seen;
      if (long.last_seen && (!short.last_seen || long.last_seen > short.last_seen)) short.last_seen = long.last_seen;
      long._deals.forEach((u) => short._deals.add(u)); short._days.push(...long._days);
      if (long._score > short._score) { short._score = long._score; short.evidence_title = long.evidence_title; short.evidence_url = long.evidence_url; short.evidence = long.evidence; }
      if (!short.website) short.website = long.website; if (!short.category) short.category = long.category;
      long._urls.forEach((u) => short._urls.add(u));
      groups.delete(keys[i]);
    }
  }
  for (const [key, g] of groups) {
    if (g.type === "Mention" && !includeMentions) continue;
    g.deals = g.type === "Mention" ? 0 : g._deals.size;   // one video naming a brand twice is one deal
    g.repeat_partner = g._days.length >= 2 && Math.max(...g._days) - Math.min(...g._days) >= 30;
    const { _score, _days, _urls, _deals, ...row } = g;
    const cid = key.split("|")[0];
    (out.get(cid) || out.set(cid, []).get(cid)!).push(row);
  }
  for (const list of out.values()) list.sort((a, b) => DEAL_TYPE_RANK[b.type] - DEAL_TYPE_RANK[a.type] || String(b.last_seen || "").localeCompare(String(a.last_seen || "")));
  return out;
}

