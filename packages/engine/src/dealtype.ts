// What kind of relationship a detected deal is. The detector scores how sure it is that a
// brand appears; this says what the appearance is: a paid sponsorship, gifted product, an
// affiliate / referral / code link, or just a mention (a bare link or hashtag).
// Pure text rules over the stored signal type and evidence, so it works on rows already scanned.

export type DealType = "Sponsored" | "Gifted" | "Affiliate" | "Mention";
export const DEAL_TYPE_RANK: Record<DealType, number> = { Sponsored: 3, Gifted: 2, Affiliate: 1, Mention: 0 };

const SPONSOR_RE = /\bsponsor(?:ed|ing|s|ship)?\b|paid (?:partnership|promotion)|\bpartner(?:ed|ing|ship)? with\b|\bbrought to you by\b|#ad\b|#sponsored\b|\bpresented by\b/i;
const GIFT_RE = /\bprovided by\b|\bsupplied by\b|\bgifted\b|\bfor sending\b|\bsent (?:me|us|over|by)\b|\bcourtesy of\b|\bpr package\b|\bsent this\b/i;
const AFFIL_TEXT_RE = /\baffiliate\b|\breferral\b|\brefer(?:-| )a(?:-| )friend\b|\bcommission\b|\b(?:use|with) (?:my |our |the )?(?:code|link)\b|\bpromo ?code\b|\bcoupon\b|\d{1,2}\s?% (?:off|discount)\b|\bdiscount\b|\bfree trial\b/i;

// Networks that sit between the creator and the brand: the brand is the subdomain, not the domain.
const TRACKER_HOSTS = ["pxf.io", "sjv.io", "go2cloud.org", "evyy.net", "pntra.com", "pntrs.com", "pntrac.com", "gqco.net", "ojrq.net", "dpbolvw.net", "jdoqocy.com", "tkqlhce.com", "anrdoezrs.net", "kqzyfj.com", "shareasale.com", "linksynergy.com", "awin1.com", "avantlink.com", "impact.com", "partnerstack.com", "grsm.io", "rfer.us", "tapfiliate.com", "firstpromoter.com", "rewardful.com", "lvnta.com", "uppromote.com", "refersion.com", "idevaffiliate.com", "hasoffers.com", "tune.com", "mavely.app", "howl.me", "geni.us", "amzn.to", "bit.ly"];
const TRACKER_CUT_RE = new RegExp(`([a-z0-9-]{3,})\\.(?:${TRACKER_HOSTS.map((t) => t.split(".")[0]).filter((l) => l.length >= 5).join("|")})\\.?(?:$|[^a-z0-9-])`);
const AFFIL_SUBDOMAINS = new Set(["try", "go", "get", "join", "partner", "partners", "affiliate", "affiliates", "refer", "referral", "ref", "track", "link", "links", "click", "shop"]);
const AFFIL_PARAMS = new Set(["ref", "referral", "referrer", "refer", "friend", "fpr", "bta", "aff", "affid", "aff_id", "afp", "affiliate", "affiliate_id", "via", "irclickid", "irgwc", "coupon", "promo", "invite", "rfsn", "sca_ref", "lmref", "pscd", "ps_partner_key", "gr_pk", "tap_a", "a_aid", "offer_id"]);

const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** First URL (with or without scheme) inside a piece of evidence text. */
export function firstUrl(text: string): URL | null {
  const m = String(text || "").match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#][^\s)\]"'<>]*)?/i);
  if (!m) return null;
  try { return new URL(/^https?:\/\//i.test(m[0]) ? m[0] : `https://${m[0]}`); } catch { return null; }
}

const trackerOf = (host: string) => TRACKER_HOSTS.find((t) => host === t || host.endsWith(`.${t}`)) || null;

/**
 * When a link goes through an affiliate network (tailorbrands.go2cloud.org, shopify.pxf.io),
 * the real brand is the subdomain. Returns that label ("tailorbrands"), or null.
 */
export function trackerBrand(text: string): string | null {
  const ok = (sub: string) => (sub.length >= 3 && !AFFIL_SUBDOMAINS.has(sub) && sub !== "www" ? sub : null);
  const u = firstUrl(text);
  if (u) {
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const t = trackerOf(host);
    if (t && host !== t) return ok(host.slice(0, -(t.length + 1)).split(".").pop() || "");
  }
  // stored evidence is cut to a fixed length, so the link can stop mid-domain ("tailorbrands.go2cloud.")
  const m = String(text || "").toLowerCase().match(TRACKER_CUT_RE);
  return m ? ok(m[1]) : null;
}

function looksAffiliateUrl(u: URL, creatorHandle?: string | null): boolean {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (trackerOf(host)) return true;
  const labels = host.split(".");
  if (labels.length >= 3 && AFFIL_SUBDOMAINS.has(labels[0])) return true;
  for (const k of u.searchParams.keys()) if (AFFIL_PARAMS.has(k.toLowerCase())) return true;
  if (/idevaffiliate|\/affiliates?\/|\/refer(?:ral)?\/|\/r\/[A-Za-z0-9]{4,}/i.test(u.pathname)) return true;
  // vanity path: brand.com/<creator handle>
  const h = norm(creatorHandle || "");
  if (h.length >= 4) { const segs = u.pathname.split("/").filter(Boolean).map(norm); if (segs.some((s) => s === h || (s.length >= 5 && (h.includes(s) || s.includes(h))))) return true; }
  return false;
}

/** Classify one stored deal row. */
export function dealType(signalType: string | null | undefined, evidence: string | null | undefined, creatorHandle?: string | null): DealType {
  const sig = String(signalType || ""); const ev = String(evidence || "");
  if (/Sponsorship Mention/i.test(sig) || SPONSOR_RE.test(ev)) return "Sponsored";
  if (/Product Seeding/i.test(sig) || GIFT_RE.test(ev)) return "Gifted";
  if (/Discount Code/i.test(sig) || AFFIL_TEXT_RE.test(ev)) return "Affiliate";
  const u = firstUrl(ev);
  if (u && looksAffiliateUrl(u, creatorHandle)) return "Affiliate";
  return "Mention";
}
