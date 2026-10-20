// Sales Nav enrichment. Rows arrive from the Sponsorprint Sales Nav extension via
// /api/salesnav/ingest; this job finds the company domain and emails with the house
// Hunter key, inside a daily call budget (SALESNAV_HUNTER_DAILY, default 150).
//   accounts: domain (from the index, else Hunter by company name) + domain search,
//             bucketed into partnerships / marketing / general.
//   people:   Hunter email finder on first + last name. 85+ counts as verified (Rootfor's bar).
// Verified, named, non-generic emails at a brand already in the index are filed into
// contacts as house-only rows (never visible to outside users).
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyEmail, isGenericInbox } from "@creatorlens/engine";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[salesnav]", ...a);
const KEY = () => process.env.HUNTER_API_KEY;
const DAILY = () => Number(process.env.SALESNAV_HUNTER_DAILY || 150);
const VERIFIED = 85;
const dom = (w: string | null | undefined) => (w ? String(w).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase() || null : null);

class Budget { constructor(public left: number, public used = 0, public stopped = false) {} }

async function hunter(path: string, params: Record<string, string>, b: Budget): Promise<any | null> {
  if (b.stopped || b.left <= 0) return null;
  const q = new URLSearchParams({ ...params, api_key: KEY()! });
  b.left--; b.used++;
  const r = await fetch(`https://api.hunter.io/v2/${path}?${q}`).catch(() => null);
  if (!r) return null;
  if (r.status === 429 || r.status === 403) { b.stopped = true; log("hunter", r.status, "pausing until next tick"); return null; }
  if (!r.ok) { log("hunter", path, r.status, (await r.text().catch(() => "")).slice(0, 160)); return null; }
  return (await r.json().catch(() => null))?.data || null;
}

export async function runSalesNavEnrich(sb: SupabaseClient): Promise<number> {
  if (!KEY()) return 0;
  const day = new Date().toISOString().slice(0, 10);
  const { data: spend } = await sb.from("salesnav_spend").select("hunter_calls").eq("day", day).maybeSingle();
  const b = new Budget(Math.max(0, DAILY() - (spend?.hunter_calls || 0)));
  if (b.left <= 0) return 0;
  let n = 0;
  try {
    n += await enrichAccounts(sb, b);
    n += await enrichPeople(sb, b);
  } finally {
    if (b.used) await sb.rpc("salesnav_spend_add", { p_n: b.used });
  }
  if (n) log("enriched", n, "rows,", b.used, "hunter calls");
  return n;
}

async function enrichAccounts(sb: SupabaseClient, b: Budget) {
  const { data: rows } = await sb.from("salesnav_accounts").select("id,li_company_id,name,domain,brand_id,scraped_by,brands(website,domain)").eq("enrich_status", "pending").order("score", { ascending: false }).order("first_seen").limit(3);
  let n = 0;
  for (const a of (rows || []) as any[]) {
    if (b.stopped || b.left < 2) break;
    let domain = a.domain || dom(a.brands?.website) || dom(a.brands?.domain);
    let data: any = null;
    if (domain) data = await hunter("domain-search", { domain, limit: "25" }, b);
    else { data = await hunter("domain-search", { company: a.name, limit: "25" }, b); domain = dom(data?.domain); }
    if (b.stopped && !data) break;
    if (!domain) { await sb.from("salesnav_accounts").update({ enrich_status: "no_domain", enriched_at: new Date().toISOString() }).eq("id", a.id); n++; continue; }
    const emails = ((data?.emails || []) as any[]).map((e) => ({ email: String(e.value).toLowerCase(), name: [e.first_name, e.last_name].filter(Boolean).join(" ") || null, title: e.position || null, confidence: e.confidence ?? null, bucket: classifyEmail(e) }))
      .sort((x, y) => rank(x.bucket) - rank(y.bucket) || (y.confidence || 0) - (x.confidence || 0)).slice(0, 15);
    await sb.from("salesnav_accounts").update({ domain, emails, enrich_status: "done", enriched_at: new Date().toISOString() }).eq("id", a.id);
    // People at this company waiting on a domain can now be looked up.
    await sb.from("salesnav_people").update({ domain }).eq("li_company_id", a.li_company_id).is("domain", null);
    await sb.from("salesnav_people").update({ enrich_status: "pending" }).eq("li_company_id", a.li_company_id).eq("enrich_status", "no_domain").gte("relevance", 2);
    if (a.brand_id) {
      const keep = emails.filter((e) => e.name && (e.bucket === "partnerships" || e.bucket === "marketing") && (e.confidence || 0) >= VERIFIED && !isGenericInbox(e.email) && e.email.endsWith("@" + domain));
      if (keep.length) await sb.from("contacts").upsert(keep.map((e) => ({ brand_id: a.brand_id, name: e.name, email: e.email, title: e.title, source: "hunter", verified: true, house_only: true, found_by: a.scraped_by, confidence: (e.confidence || 0) / 100, source_url: `https://www.linkedin.com/sales/company/${a.li_company_id}` })), { onConflict: "brand_id,email", ignoreDuplicates: true });
    }
    n++;
  }
  return n;
}
const rank = (bucket: string) => ({ partnerships: 0, marketing: 1, general: 2, other: 3 } as Record<string, number>)[bucket] ?? 4;

async function enrichPeople(sb: SupabaseClient, b: Budget) {
  // Explicit "Find email" clicks first, then auto-queued creator-facing titles.
  const pick = async (status: string, limit: number) => (await sb.from("salesnav_people").select("id,li_lead_id,first_name,last_name,name_partial,title,company,li_company_id,domain,brand_id,scraped_by,brands(website,domain)").eq("enrich_status", status).order("relevance", { ascending: false }).order("first_seen").limit(limit)).data || [];
  const queued = await pick("queued", 6);
  const rows = queued.length >= 6 ? queued : [...queued, ...(await pick("pending", 6 - queued.length))];
  let n = 0;
  const acctDomain = new Map<string, string | null>();
  for (const p of rows as any[]) {
    if (b.stopped || b.left <= 0) break;
    const now = new Date().toISOString();
    if (p.name_partial || !p.first_name || !p.last_name) { await sb.from("salesnav_people").update({ enrich_status: "partial_name", enriched_at: now }).eq("id", p.id); n++; continue; }
    let domain = p.domain || dom(p.brands?.website) || dom(p.brands?.domain);
    if (!domain && p.li_company_id) {
      if (!acctDomain.has(p.li_company_id)) { const { data } = await sb.from("salesnav_accounts").select("domain").eq("li_company_id", p.li_company_id).maybeSingle(); acctDomain.set(p.li_company_id, data?.domain || null); }
      domain = acctDomain.get(p.li_company_id) || null;
    }
    if (!domain && !p.company) { await sb.from("salesnav_people").update({ enrich_status: "no_domain", enriched_at: now }).eq("id", p.id); n++; continue; }
    const data = await hunter("email-finder", { first_name: p.first_name, last_name: p.last_name, ...(domain ? { domain } : { company: p.company }) }, b);
    if (b.stopped && !data) break;
    const email = data?.email ? String(data.email).toLowerCase() : null;
    const score: number | null = data?.score ?? null;
    const status = data?.verification?.status as string | undefined;
    const verified = !!email && (score || 0) >= VERIFIED && status !== "invalid";
    const foundDomain = domain || dom(data?.domain);
    if (!email) { await sb.from("salesnav_people").update({ enrich_status: foundDomain ? "not_found" : "no_domain", domain: foundDomain, enriched_at: now }).eq("id", p.id); n++; continue; }
    let contact_id: string | null = null;
    if (verified && p.brand_id && !isGenericInbox(email)) {
      const { data: c } = await sb.from("contacts").upsert({ brand_id: p.brand_id, name: [p.first_name, p.last_name].join(" "), email, title: p.title, source: "hunter", verified: true, house_only: true, found_by: p.scraped_by, confidence: (score || 0) / 100, source_url: `https://www.linkedin.com/sales/lead/${p.li_lead_id}` }, { onConflict: "brand_id,email" }).select("id").maybeSingle();
      contact_id = c?.id || null;
    }
    await sb.from("salesnav_people").update({ email, email_score: score, email_verified: verified, domain: foundDomain, contact_id, enrich_status: "done", enriched_at: now }).eq("id", p.id);
    n++;
  }
  return n;
}
