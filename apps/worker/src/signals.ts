// Signals agent. Weekly: search the wires and trade press for sponsorship
// announcements (brand signs a team, league, event, venue), extract and store
// them, then match each one to roster creators by market and category so a
// manager sees "Empower signed the Broncos; Jimmy is a Denver dad creator;
// pitch this week" instead of an inbound email two months later.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alert } from "./observe";

const MODEL = process.env.ANTHROPIC_SIGNALS_MODEL || "claude-sonnet-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[signals]", ...a);

const GENERAL = [
  "\"official partner\" announces multi-year partnership",
  "\"named official\" partner of the",
  "\"presenting partner\" announced sponsorship",
  "\"title sponsor\" new sponsorship deal announced",
  "brand sponsorship deal team league site:prnewswire.com OR site:businesswire.com",
  "sponsorship deal sports business journal new partner",
  "festival presenting sponsor announced brand partnership",
];

type Found = { brand: string; brand_domain: string | null; property: string; property_type: string; market: string; region: string; category: string; announced_at: string | null; url: string; source: string; summary: string; activation_note: string };

export async function findSignals(sb: SupabaseClient): Promise<number> {
  if (!client) return 0;
  // regional queries for every market people's rosters live in
  const { data: locs } = await sb.from("roster_creators").select("region,location").not("region", "is", null);
  const regions = [...new Set((locs || []).map((l) => l.region).filter(Boolean))].slice(0, 12);
  const queries = [...GENERAL, ...regions.map((r) => `"official partner" OR "presenting partner" sponsorship announced ${r} team OR event`)];
  let inserted = 0;
  for (const q of queries) {
    try {
      const sys = `You research sponsorship announcements for a creator talent agency. Use web search to find announcements from the last 60 days where a BRAND signed a sponsorship with a sports team, league, athlete, event, festival, venue or tour. For each real one return: brand (the sponsor, not the property), brand_domain if known, property, property_type (team|league|event|festival|venue|athlete|tour|other), market (the city/metro the property is based in, or "National (US)"/"National (CA)" for leagues), region (the state/province two-letter code, or the country code for national), category (the brand's category: Finance, Food, Beverage, Auto, Tech, Telecom, Retail, Apparel, Beauty, Travel, Insurance, Health, Gaming, Home, Other), announced_at (YYYY-MM-DD), url (the announcement or credible article), source (prnewswire|businesswire|sbj|sportico|fos|adweek|adage|team|brand|other), summary (one sentence), activation_note (one sentence on what creator activation this kind of deal usually involves and when, e.g. "regional creator campaigns typically launch 4-8 weeks after signing, around home games"). Skip renewals older than 60 days and skip agencies. Reply ONLY with JSON: {"signals":[...]} up to 8.`;
      const msg = await client.messages.create({ model: MODEL, max_tokens: 3000, temperature: 0.2, system: sys, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 } as any], messages: [{ role: "user", content: `Query: ${q}\nToday: ${new Date().toISOString().slice(0, 10)}` }] });
      const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
      const m = text.match(/\{[\s\S]*\}/); if (!m) continue;
      const list: Found[] = (JSON.parse(m[0]).signals || []).filter((x: Found) => x?.url && x?.brand && x?.property);
      for (const x of list) {
        const url = String(x.url).split("?")[0];
        const { data: dup } = await sb.from("signals").select("id").eq("url", url).maybeSingle();
        if (dup) continue;
        let brandId: string | null = null;
        const dom = x.brand_domain ? String(x.brand_domain).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : null;
        if (dom) { const { data } = await sb.from("brands").select("id").eq("domain", dom).maybeSingle(); brandId = data?.id || null; }
        if (!brandId) { const { data } = await sb.from("brands").select("id").ilike("name", x.brand.trim()).maybeSingle(); brandId = data?.id || null; }
        const { error } = await sb.from("signals").insert({ brand_id: brandId, brand: x.brand.trim(), brand_domain: dom, property: x.property, property_type: x.property_type || null, market: x.market || null, region: (x.region || "").toUpperCase().slice(0, 4) || null, category: x.category || null, announced_at: x.announced_at || null, url, source: x.source || "other", summary: x.summary || null, activation_note: x.activation_note || null });
        if (!error) inserted++;
      }
    } catch (e: any) { log("query failed", q, e?.message); }
  }
  log("inserted", inserted);
  const matched = await matchSignals(sb);
  if (!inserted && !matched) await alert(sb, "signals agent found nothing new", {}).catch(() => {});
  return inserted;
}

// Category affinity: which creator lanes a brand category tends to book.
const AFFINITY: Record<string, string[]> = {
  Finance: ["Family", "Business", "Lifestyle", "Sports", "Tech", "Education"],
  Insurance: ["Family", "Home", "Auto", "Lifestyle", "Sports"],
  Food: ["Food", "Family", "Lifestyle", "Fitness", "Sports"],
  Beverage: ["Food", "Lifestyle", "Sports", "Fitness", "Entertainment", "Gaming"],
  Auto: ["Auto", "Family", "Lifestyle", "Sports", "Outdoors", "Tech"],
  Tech: ["Tech", "Gaming", "Business", "Education", "Lifestyle"],
  Telecom: ["Tech", "Family", "Lifestyle", "Sports", "Gaming"],
  Retail: ["Lifestyle", "Family", "Fashion", "Home", "Beauty"],
  Apparel: ["Fashion", "Fitness", "Sports", "Lifestyle"],
  Beauty: ["Beauty", "Fashion", "Lifestyle"],
  Travel: ["Travel", "Lifestyle", "Family", "Food"],
  Health: ["Health", "Fitness", "Wellness", "Family", "Sports"],
  Gaming: ["Gaming", "Tech", "Entertainment", "Sports"],
  Home: ["Home", "DIY", "Family", "Lifestyle"],
};

export async function matchSignals(sb: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const { data: sigs } = await sb.from("signals").select("id,brand,property,market,region,category,announced_at").or(`announced_at.gte.${since},announced_at.is.null`).order("found_at", { ascending: false }).limit(300);
  const { data: roster } = await sb.from("roster_creators").select("id,user_id,name,handle,platform,niche,region,location");
  let made = 0;
  for (const r of roster || []) {
    // creator lane from the index, else niche text
    const { data: c } = await sb.from("creators").select("category").eq("platform", r.platform === "youtube" ? "youtube" : "instagram").ilike("handle", String(r.handle || "").replace(/^@/, "")).maybeSingle();
    const lane = c?.category || null;
    const nicheText = `${r.niche || ""}`.toLowerCase();
    for (const s of sigs || []) {
      let score = 0; const why: string[] = [];
      const national = !s.region || s.region.length > 2 || /national/i.test(s.market || "");
      if (r.region && s.region && r.region.toUpperCase() === s.region.toUpperCase()) { score += 3; why.push(`${r.name} is based in ${r.location || r.region}, the ${s.property}'s market`); }
      else if (national) { score += 1; why.push(`national deal (${s.property})`); }
      else continue;   // regional deal in another market: skip
      const aff = s.category ? AFFINITY[s.category] || [] : [];
      if (lane && aff.includes(lane)) { score += 2; why.push(`${s.category} brands book ${lane} creators`); }
      else if (aff.some((a) => nicheText.includes(a.toLowerCase()))) { score += 1; why.push(`niche fits ${s.category}`); }
      if (score < 3) continue;
      const { error } = await sb.from("signal_matches").upsert({ user_id: r.user_id, signal_id: s.id, roster_creator_id: r.id, reason: why.join(" · "), score }, { onConflict: "signal_id,roster_creator_id", ignoreDuplicates: true });
      if (!error) made++;
    }
  }
  log("matches", made);
  return made;
}
