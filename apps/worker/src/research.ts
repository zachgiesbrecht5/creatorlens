// Contact research agent. For a brand where Hunter found nobody at the brand's
// own domain (typical for house brands of big CPG groups), do what a good
// partnerships manager does by hand: work out the parent company, search the
// web for the people who run influencer / creator partnerships for THIS brand,
// find out whether an agency handles creator work, then guess-and-verify the
// email through Hunter. Everything filed carries the URL it came from.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

const MODEL = process.env.ANTHROPIC_RESEARCH_MODEL || "claude-haiku-4-5";
const FALLBACK_MODEL = process.env.ANTHROPIC_RESEARCH_FALLBACK_MODEL || "claude-sonnet-4-6";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[research]", ...a);

type Person = { name: string; title: string; company: string; email_domain: string | null; source_url: string; confidence: number };
type Finding = { parent_company: string | null; agency: string | null; agency_url: string | null; summary: string; people: Person[] };

export async function runResearch(sb: SupabaseClient, limit = 1): Promise<number> {
  if (!client) return 0;
  const { data: jobs } = await sb.from("contact_research").select("id,brand_id").eq("status", "queued").order("created_at").limit(limit);
  if (!jobs?.length) return 0;
  for (const job of jobs) {
    await sb.from("contact_research").update({ status: "running" }).eq("id", job.id);
    try {
      const n = await researchBrand(sb, job.id, job.brand_id);
      log("done", job.brand_id, n, "contacts");
    } catch (e: any) {
      log("failed", job.brand_id, e?.message);
      await sb.from("contact_research").update({ status: "failed", error: String(e?.message || e).slice(0, 400), finished_at: new Date().toISOString() }).eq("id", job.id);
    }
  }
  return jobs.length;
}

async function researchBrand(sb: SupabaseClient, jobId: string, brandId: string) {
  const { data: brand } = await sb.from("brands").select("id,name,domain,website,category,site_description").eq("id", brandId).single();
  if (!brand) throw new Error("brand missing");
  // what creators have they booked? gives the agent context on the kind of program
  const { data: deals } = await sb.from("partnerships").select("platform, published_at, creators(handle, category, followers)").eq("brand_id", brandId).neq("status", "rejected").order("published_at", { ascending: false }).limit(6);
  const dealCtx = (deals || []).map((d: any) => `${d.platform} @${d.creators?.handle} (${d.creators?.category || "?"}, ${d.creators?.followers || "?"} followers, ${String(d.published_at || "").slice(0, 7)})`).join("; ");

  const system = `You are a research assistant for a creator talent agency. Find who to email at a brand about paid creator partnerships. Use web search. Be precise and cite a URL for every person. Rules:
- Only real, currently-employed people found on public pages (LinkedIn profile or company pages, press releases, conference bios, trade press, brand PR/partnership pages). Never invent names.
- Prefer titles like: influencer marketing, creator partnerships, social media, brand partnerships, digital/brand manager for THIS brand, communications/PR for this brand. At a parent company, only people whose title or page ties them to this specific brand or its category.
- Work out the parent company (e.g. Swiffer -> Procter & Gamble; Breyers -> The Magnum Ice Cream Company, formerly Unilever) and the email domain staff actually use (pg.com, not swiffer.com).
- Determine if an agency runs creator/influencer work for the brand (agency of record for influencer, social, or PR) and name it with a URL if found.
- Return 0 to 5 people. Confidence 0..1 reflects how sure you are the person is at the company now and works on this brand.
Reply ONLY with JSON: {"parent_company": string|null, "email_domain": string|null, "agency": string|null, "agency_url": string|null, "summary": "<one sentence for a human: who to contact and how>", "people": [{"name","title","company","email_domain","source_url","confidence"}]}`;

  const user = `Brand: ${brand.name}\nWebsite: ${brand.website || brand.domain || "unknown"}\nCategory: ${brand.category || "unknown"}\nSite description: ${(brand.site_description || "").slice(0, 200)}\nRecent creator deals we've seen: ${dealCtx || "none"}\n\nWho should a talent manager email about a paid creator partnership for ${brand.name}, and is there an agency handling their influencer work?`;

  // cheap model first (5 searches); if it finds nobody, one pass with the stronger model
  const ask = async (model: string, maxUses: number) => {
    const msg = await client!.messages.create({
      model, max_tokens: 2500, temperature: 0, system,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxUses } as any],
      messages: [{ role: "user", content: user }],
    });
    const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as Finding & { email_domain?: string | null }) : null;
  };
  let f = await ask(MODEL, 5);
  if (!f || !(f.people || []).length) { log("escalating to", FALLBACK_MODEL, "for", brand.name); f = (await ask(FALLBACK_MODEL, 8)) || f; }
  if (!f) throw new Error("no JSON from model");

  let filed = 0;
  for (const p of (f.people || []).slice(0, 5)) {
    if (!p.name || !p.source_url) continue;
    const domain = (p.email_domain || f.email_domain || brand.domain || "").replace(/^www\./, "").toLowerCase();
    let email: string | null = null; let verified = false; let conf = Math.min(1, Math.max(0, Number(p.confidence) || 0.4));
    if (domain && process.env.HUNTER_API_KEY) {
      const [first, ...rest] = p.name.trim().split(/\s+/); const last = rest.pop() || "";
      const r = await fetch(`https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(first)}&last_name=${encodeURIComponent(last)}&api_key=${process.env.HUNTER_API_KEY}`).then((r) => r.json()).catch(() => null);
      const e = r?.data?.email; const score = Number(r?.data?.score || 0);
      if (e && score >= 50) { email = String(e).toLowerCase(); verified = score >= 85; conf = Math.min(1, conf * (0.6 + score / 250)); }
    }
    if (!email) continue;   // no address we can stand behind: keep the person out of the contact list
    await sb.from("contacts").upsert({
      brand_id: brandId, email, name: p.name, title: `${p.title}${p.company && p.company.toLowerCase() !== brand.name.toLowerCase() ? ` · ${p.company}` : ""}`,
      source: "agent", verified, house_only: true, source_url: p.source_url, confidence: conf,
    }, { onConflict: "brand_id,email" });
    filed++;
  }
  await sb.from("contact_research").update({
    status: "done", summary: f.summary || null, parent_company: f.parent_company || null, agency: f.agency || null, agency_url: f.agency_url || null, finished_at: new Date().toISOString(),
  }).eq("id", jobId);
  return filed;
}
