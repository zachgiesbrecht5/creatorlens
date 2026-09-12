import { NextResponse, type NextRequest } from "next/server";
import { currentAccess, supabaseAdmin } from "@/lib/supabase";

// GET /api/contacts/:brandId
// Order of trust: contacts already in the pool (imported from the Outreach Log,
// or added by teammates) -> Hunter lookup (cached into the pool) -> nothing.
// Also returns the org's pitch history for this brand and the exclusion flag.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { profile, insider } = await currentAccess();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { brandId } = await params;
  const admin = supabaseAdmin();
  if (!insider) {
    // outsiders only get contacts for brands that appear on a creator they unlocked
    const { data: mine } = await admin.from("creator_access").select("platform,handle").eq("user_id", profile.id);
    const keys = new Set((mine || []).map((m) => `${m.platform}:${m.handle.toLowerCase()}`));
    const { data: sponsored } = keys.size ? await admin.from("partnerships").select("creators(platform,handle,external_id)").eq("brand_id", brandId).neq("status", "rejected").limit(500) : { data: [] };
    const hit = (sponsored || []).some((r: any) => r.creators && (keys.has(`${r.creators.platform}:${String(r.creators.handle).toLowerCase()}`) || keys.has(`${r.creators.platform}:${String(r.creators.external_id || "").toLowerCase()}`)));
    if (!hit) return NextResponse.json({ error: "Scan a creator this brand sponsors to unlock its contact." }, { status: 403 });
  }

  const { data: brand } = await admin.from("brands").select("id,name,key,domain,website").eq("id", brandId).single();
  if (!brand) return NextResponse.json({ error: "Unknown brand" }, { status: 404 });

  // The brand's verified website (resolved by the worker) is the source of truth
  // for which email domains are acceptable. Without it we fall back to the
  // stored domain, and finally to a name-based lookup that must still look like
  // the brand (this is what stops "abercrombie.ru" from being offered).
  let siteDomain = brand.website ? new URL(brand.website).hostname.replace(/^www\./, "") : null;
  if (!siteDomain) {
    // Worker hasn't verified this brand yet: try the obvious domain right now.
    const guess = await quickSite(`${brand.key}.com`);
    if (guess) { siteDomain = guess; await admin.from("brands").update({ website: `https://${guess}`, site_status: "ok", site_checked_at: new Date().toISOString(), domain: guess }).eq("id", brandId); }
  }
  const acceptable = (email: string) => {
    const [local, d] = email.toLowerCase().split("@");
    if (!d || !local) return false;
    if (GENERIC_INBOX.test(local)) return false;                  // info@, support@ ... go to spam
    if (siteDomain) return rootOf(d) === rootOf(siteDomain) && d.split(".").length <= 3;
    // no verified site yet: exact brand key on a mainstream TLD only
    return rootOf(d).replace(/[^a-z0-9]/g, "") === brand.key && /\.(com|ca|co|io|net|org|shop|us|uk|co\.uk)$/.test(d);
  };
  const relevant = (title: string | null) => titleScore(title || "") > 0;

  let { data: contacts } = await admin.from("contacts").select("id,name,email,title,source,verified,last_replied_at,house_only,found_by").eq("brand_id", brandId)
    .order("verified", { ascending: false }).order("last_replied_at", { ascending: false, nullsFirst: false });
  const auto = (c: { source: string }) => c.source === "hunter" || c.source === "apollo";
  // Provenance wall. Outsiders only ever see third-party lookups (never Rootfor's
  // own tracker/relationship contacts) plus emails they pasted themselves.
  const visible = (c: { source: string; house_only: boolean; found_by: string | null }) =>
    insider || (!c.house_only && auto(c)) || (c.source === "manual" && c.found_by === profile.id);
  contacts = (contacts || []).filter(visible).filter((c) => !auto(c) || (acceptable(c.email || "") && relevant(c.title)));

  if (!contacts.length) {
    let people: any[] = [];
    if (process.env.HUNTER_API_KEY) people = (await hunter(brand.name, siteDomain)).people;
    people = people.filter((p) => acceptable(p.email) && relevant(p.title));
    if (!people.length && process.env.APOLLO_API_KEY && siteDomain) people = (await apollo(siteDomain)).filter((p) => acceptable(p.email) && relevant(p.title));
    if (people.length) {
      await admin.from("contacts").upsert(people.map((p: any) => ({ brand_id: brandId, name: p.name, email: p.email, title: p.title, source: p.source || "hunter", verified: p.confidence >= 90 })), { onConflict: "brand_id,email" });
      contacts = ((await admin.from("contacts").select("id,name,email,title,source,verified,last_replied_at,house_only,found_by").eq("brand_id", brandId)).data || []).filter(visible).filter((c) => !auto(c) || (acceptable(c.email || "") && relevant(c.title)));
    }
  }
  brand.domain = siteDomain || brand.domain;

  const orgFilter = insider && profile.org_id ? `org_id.eq.${profile.org_id},user_id.eq.${profile.id}` : `user_id.eq.${profile.id}`;
  const { data: history } = await admin.from("outreach_log").select("status,created_at,creator_handle,user_id,profiles(full_name)").eq("brand_id", brandId).or(orgFilter).order("created_at", { ascending: false }).limit(5);
  const { data: excl } = insider && profile.org_id ? await admin.from("exclusions").select("id").eq("org_id", profile.org_id).eq("brand_key", brand.key).maybeSingle() : { data: null };

  return NextResponse.json({
    contacts: (contacts || []).map(({ house_only: _h, found_by: _f, last_replied_at, ...c }) => ({ ...c, last_replied_at: insider ? last_replied_at : null })),
    history: (history || []).map((h: any) => ({ status: h.status, created_at: h.created_at, creator_handle: h.creator_handle, by: h.profiles?.full_name || null })),
    excluded: !!excl,
    domain: brand.domain,
  });
}

const GENERIC_INBOX = /^(info|contact|hello|hi|support|help|customerservice|customer\.?care|service|sales|press|media|careers|jobs|hr|legal|billing|orders?|admin|office|team|noreply|no-reply|marketing|partnerships?|collabs?|influencers?)$/;

// Who actually books creators. 0 = not a fit (engineering, finance, licensing,
// sales reps, talent managers at agencies); we never show 0.
function titleScore(t: string): number {
  const x = t.toLowerCase();
  if (/engineer|developer|finance|account(ing|ant)|legal|counsel|licens|compliance|hr\b|human resources|recruit|talent manager|talent agent|customer (service|success|support)|logistics|supply|operations|warehouse|sales (rep|associate|executive)|account executive|performance marketing|growth marketing|paid (media|social)|seo|sem\b|email marketing|crm|data|analyst|it\b|security|product manager|designer|copywriter|intern/.test(x)) return 0;
  if (/influencer|creator|partnership|collab|ambassador|talent|sponsorship/.test(x)) return 3;
  if (/brand|marketing|social|community|\bpr\b|public relations|communications|content|campaign|digital/.test(x)) return 2;
  if (/founder|ceo|cmo|owner|president|managing director/.test(x)) return 1;
  return 0;
}

async function quickSite(host: string): Promise<string | null> {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`https://${host}`, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; Sponsorprint/1.0)" } });
    clearTimeout(t);
    if (r.status < 400 || r.status === 403 || r.status === 429) return new URL(r.url).hostname.replace(/^www\./, "");
  } catch { /* unreachable */ }
  return null;
}

// "shop.brand.co.uk" -> "brand"; good enough to compare an email domain to a site.
function rootOf(host: string) {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  const tld2 = /^(co|com|org|net|ac|gov)$/.test(parts[parts.length - 2] || "") && parts.length >= 3;
  return parts[parts.length - (tld2 ? 3 : 2)] || parts[0] || "";
}

// Apollo.io (optional, APOLLO_API_KEY): search people at the brand's domain
// with partnership / influencer titles, then reveal the top match's email.
async function apollo(domain: string) {
  const key = process.env.APOLLO_API_KEY!;
  const search = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({ q_organization_domains: domain, person_titles: ["influencer marketing", "partnerships", "creator partnerships", "brand marketing", "social media", "marketing"], page: 1, per_page: 5 }),
  }).catch(() => null);
  if (!search || !search.ok) return [] as any[];
  const j: any = await search.json();
  const out: any[] = [];
  for (const p of (j.people || []).slice(0, 2)) {
    const m = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({ id: p.id, reveal_personal_emails: false }),
    }).catch(() => null);
    const mj: any = m && m.ok ? await m.json() : null;
    const email = mj?.person?.email;
    if (email) out.push({ name: p.name, email, title: p.title, confidence: mj.person.email_status === "verified" ? 95 : 70, source: "apollo" });
  }
  return out;
}

// Hunter.io domain search. A plain search returns ten arbitrary people, which
// at a large company is engineers and sales, so we ask by department and
// seniority first (the people who actually book creators), then widen.
async function hunter(company: string, domain: string | null) {
  const key = process.env.HUNTER_API_KEY;
  const base = domain ? `domain=${encodeURIComponent(domain)}` : `company=${encodeURIComponent(company)}`;
  const passes = [
    `${base}&department=marketing,communication&seniority=executive,senior&limit=25`,
    `${base}&department=marketing,communication&limit=50`,
    `${base}&limit=25`,
  ];
  const seen = new Map<string, any>();
  let resolved: string | null = null;
  for (const q of passes) {
    const r = await fetch(`https://api.hunter.io/v2/domain-search?${q}&api_key=${key}`).catch(() => null);
    if (!r) continue;
    if (!r.ok) { console.warn("hunter", r.status, await r.text().catch(() => "")); continue; }
    const j: any = await r.json();
    const d = j.data || {};
    resolved = resolved || d.domain || null;
    for (const e of d.emails || []) {
      if (!e.value || seen.has(e.value)) continue;
      seen.set(e.value, { name: [e.first_name, e.last_name].filter(Boolean).join(" ") || null, email: e.value, title: e.position || null, confidence: e.confidence || 0, source: "hunter" });
    }
    // stop once we have a few people who look like they book creators
    if ([...seen.values()].filter((p) => titleScore(p.title || "") >= 2).length >= 3) break;
  }
  const people = [...seen.values()]
    .sort((a, b) => titleScore(b.title || "") - titleScore(a.title || "") || b.confidence - a.confidence)
    .slice(0, 8);
  return { domain: resolved, people };
}
