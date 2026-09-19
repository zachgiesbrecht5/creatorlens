// Hiring-signal agent. Weekly: search public job boards for influencer /
// creator / partnerships marketing roles, extract the company and role, match
// to a brand in the index, and store. Re-checks known open postings and marks
// them closed when the page is gone (the hire is probably made: 45-60 day
// window to pitch the new person).
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alert } from "./observe";

const MODEL = process.env.ANTHROPIC_HIRING_MODEL || "claude-sonnet-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[hiring]", ...a);

const QUERIES = [
  "influencer marketing manager job posting",
  "creator partnerships manager hiring",
  "influencer marketing coordinator job",
  "head of influencer marketing job posting",
  "creator marketing lead job greenhouse OR lever OR ashby",
  "brand partnerships manager influencer job",
];

type Found = { company: string; domain: string | null; title: string; seniority: string | null; location: string | null; url: string; posted_at: string | null; summary: string };

export async function findHiring(sb: SupabaseClient): Promise<number> {
  if (!client) return 0;
  let inserted = 0;
  for (const q of QUERIES) {
    try {
      const sys = `You research job postings for a creator talent agency. Use web search to find CURRENT public postings (career pages, Greenhouse, Lever, Ashby, Workable, Indeed) for the query. For each real posting return: company (the brand, not the recruiter), the company's website domain if you can tell, exact title, seniority (coordinator|manager|senior|director|head|vp), location, the posting URL, the posting date if shown (YYYY-MM-DD) and a one-sentence summary of what the role implies about the brand's creator program (budget, platforms, launch). Skip agencies and talent management companies. Reply ONLY with JSON: {"postings":[{...}]}, up to 8.`;
      const msg = await client.messages.create({ model: MODEL, max_tokens: 2500, temperature: 0.2, system: sys, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 } as any], messages: [{ role: "user", content: `Query: ${q}\nToday: ${new Date().toISOString().slice(0, 10)}` }] });
      const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
      const m = text.match(/\{[\s\S]*\}/); if (!m) continue;
      const list: Found[] = (JSON.parse(m[0]).postings || []).filter((p: Found) => p?.url && p?.company && p?.title);
      for (const p of list) {
        const url = String(p.url).split("?")[0];
        const { data: dup } = await sb.from("hiring_signals").select("id").eq("url", url).maybeSingle();
        if (dup) continue;
        // match a brand: by domain, then by name
        let brandId: string | null = null;
        const dom = p.domain ? String(p.domain).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : null;
        if (dom) { const { data } = await sb.from("brands").select("id").eq("domain", dom).maybeSingle(); brandId = data?.id || null; }
        if (!brandId) { const { data } = await sb.from("brands").select("id").ilike("name", p.company.trim()).maybeSingle(); brandId = data?.id || null; }
        const { error } = await sb.from("hiring_signals").insert({ brand_id: brandId, company: p.company.trim(), domain: dom, title: p.title, seniority: p.seniority || null, location: p.location || null, url, posted_at: p.posted_at || null, summary: p.summary || null });
        if (!error) inserted++;
      }
    } catch (e: any) { log("query failed", q, e?.message); }
  }
  // closed-posting check: open signals older than 7 days, HEAD the URL
  const { data: open } = await sb.from("hiring_signals").select("id,url").is("closed_at", null).lt("found_at", new Date(Date.now() - 7 * 864e5).toISOString()).limit(40);
  for (const s of open || []) {
    try { const r = await fetch(s.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) }); if (r.status === 404 || r.status === 410) await sb.from("hiring_signals").update({ closed_at: new Date().toISOString() }).eq("id", s.id); }
    catch { /* leave open */ }
  }
  log("inserted", inserted);
  if (!inserted) await alert(sb, "hiring agent found nothing new", {}).catch(() => {});
  return inserted;
}
