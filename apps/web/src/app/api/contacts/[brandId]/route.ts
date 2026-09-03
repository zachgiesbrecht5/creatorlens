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

  const { data: brand } = await admin.from("brands").select("id,name,key,domain").eq("id", brandId).single();
  if (!brand) return NextResponse.json({ error: "Unknown brand" }, { status: 404 });

  let { data: contacts } = await admin.from("contacts").select("id,name,email,title,source,verified,last_replied_at").eq("brand_id", brandId)
    .order("verified", { ascending: false }).order("last_replied_at", { ascending: false, nullsFirst: false });

  if ((!contacts || !contacts.length) && process.env.HUNTER_API_KEY) {
    const found = await hunter(brand.name, brand.domain);
    if (found.domain && !brand.domain) await admin.from("brands").update({ domain: found.domain }).eq("id", brandId);
    if (found.people.length) {
      await admin.from("contacts").upsert(found.people.map((p: any) => ({ brand_id: brandId, name: p.name, email: p.email, title: p.title, source: "hunter", verified: p.confidence >= 90 })), { onConflict: "brand_id,email" });
      contacts = (await admin.from("contacts").select("id,name,email,title,source,verified,last_replied_at").eq("brand_id", brandId)).data;
    }
    brand.domain = brand.domain || found.domain;
  }

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
  // generic inbox as a last resort
  if (!people.length && d.domain) people.push({ name: null, email: `partnerships@${d.domain}`, title: "generic inbox (unverified)", confidence: 0 });
  return { domain: d.domain || domain, people };
}
