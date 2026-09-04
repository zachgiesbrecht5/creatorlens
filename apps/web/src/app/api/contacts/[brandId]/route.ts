import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

// GET /api/contacts/:brandId
// Order of trust: contacts already in the pool (imported from the Outreach Log,
// or added by teammates) -> Hunter lookup (cached into the pool) -> nothing.
// Also returns the org's pitch history for this brand and the exclusion flag.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { brandId } = await params;
  const admin = supabaseAdmin();

  const { data: brand } = await admin.from("brands").select("id,name,key,domain,website").eq("id", brandId).single();
  if (!brand) return NextResponse.json({ error: "Unknown brand" }, { status: 404 });

  // The brand's verified website (resolved by the worker) is the source of truth
  // for which email domains are acceptable. Without it we fall back to the
  // stored domain, and finally to a name-based lookup that must still look like
  // the brand (this is what stops "abercrombie.ru" from being offered).
  const siteDomain = brand.website ? new URL(brand.website).hostname.replace(/^www\./, "") : brand.domain;
  const acceptable = (email: string) => {
    const d = email.split("@")[1]?.toLowerCase() || "";
    if (!d) return false;
    if (siteDomain) return rootOf(d) === rootOf(siteDomain);
    return rootOf(d).replace(/[^a-z0-9]/g, "") === brand.key;   // name-based: exact brand key, any TLD
  };

  let { data: contacts } = await admin.from("contacts").select("id,name,email,title,source,verified,last_replied_at").eq("brand_id", brandId)
    .order("verified", { ascending: false }).order("last_replied_at", { ascending: false, nullsFirst: false });
  contacts = (contacts || []).filter((c) => c.source !== "hunter" && c.source !== "apollo" ? true : acceptable(c.email || ""));

  if (!contacts.length) {
    let people: any[] = [];
    if (process.env.HUNTER_API_KEY) people = (await hunter(brand.name, siteDomain)).people;
    people = people.filter((p) => acceptable(p.email));
    if (!people.length && process.env.APOLLO_API_KEY && siteDomain) people = (await apollo(siteDomain)).filter((p) => acceptable(p.email));
    if (people.length) {
      await admin.from("contacts").upsert(people.map((p: any) => ({ brand_id: brandId, name: p.name, email: p.email, title: p.title, source: p.source || "hunter", verified: p.confidence >= 90 })), { onConflict: "brand_id,email" });
      contacts = ((await admin.from("contacts").select("id,name,email,title,source,verified,last_replied_at").eq("brand_id", brandId)).data || []).filter((c) => acceptable(c.email || "") || (c.source !== "hunter" && c.source !== "apollo"));
    }
  }
  brand.domain = siteDomain || brand.domain;

  const orgFilter = profile.org_id ? `org_id.eq.${profile.org_id},user_id.eq.${profile.id}` : `user_id.eq.${profile.id}`;
  const { data: history } = await admin.from("outreach_log").select("status,created_at,creator_handle,user_id,profiles(full_name)").eq("brand_id", brandId).or(orgFilter).order("created_at", { ascending: false }).limit(5);
  const { data: excl } = profile.org_id ? await admin.from("exclusions").select("id").eq("org_id", profile.org_id).eq("brand_key", brand.key).maybeSingle() : { data: null };

  return NextResponse.json({
    contacts: contacts || [],
    history: (history || []).map((h: any) => ({ status: h.status, created_at: h.created_at, creator_handle: h.creator_handle, by: h.profiles?.full_name || null })),
    excluded: !!excl,
    domain: brand.domain,
  });
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

// Hunter.io domain search resolves a company name to a domain and lists
// people; we prefer marketing / partnerships / influencer titles.
async function hunter(company: string, domain: string | null) {
  const q = domain ? `domain=${encodeURIComponent(domain)}` : `company=${encodeURIComponent(company)}`;
  const r = await fetch(`https://api.hunter.io/v2/domain-search?${q}&limit=10&api_key=${process.env.HUNTER_API_KEY}`).catch(() => null);
  if (!r || !r.ok) return { domain: null as string | null, people: [] as any[] };
  const j: any = await r.json();
  const d = j.data || {};
  const score = (t: string) => (/influencer|creator|partnership|collab|talent/i.test(t) ? 3 : /marketing|brand|social|community|pr\b|communications/i.test(t) ? 2 : /founder|ceo|owner/i.test(t) ? 1 : 0);
  const people = (d.emails || [])
    .map((e: any) => ({ name: [e.first_name, e.last_name].filter(Boolean).join(" ") || null, email: e.value, title: e.position || null, confidence: e.confidence || 0 }))
    .filter((p: any) => p.email)
    .sort((a: any, b: any) => score(b.title || "") - score(a.title || "") || b.confidence - a.confidence)
    .slice(0, 5);
  // generic inbox as a last resort (only when we asked by domain, so it is the right company)
  if (!people.length && domain) people.push({ name: null, email: `partnerships@${domain}`, title: "generic inbox (unverified)", confidence: 0 });
  return { domain: d.domain || domain, people };
}
