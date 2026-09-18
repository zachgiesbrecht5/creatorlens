// "Why this brand, why then": after a scan, one Haiku call per creator that
// looks at every detected deal (brand, category, month, evidence) plus the
// creator's niche and writes a one-liner for each. Cached in deal_insights;
// re-run only when the creator has brands without an insight.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

const MODEL = process.env.ANTHROPIC_INSIGHTS_MODEL || "claude-haiku-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[insights]", ...a);

export async function explainCreatorDeals(sb: SupabaseClient, creatorId: string): Promise<number> {
  if (!client) return 0;
  const { data: creator } = await sb.from("creators").select("id,handle,display_name,platform,followers,category,bio").eq("id", creatorId).single();
  if (!creator) return 0;
  const { data: wall } = await sb.from("brand_wall").select("brand_id,brand,category,deals,first_seen,last_seen,evidence,repeat_partner,is_mass_sponsor").eq("creator_id", creatorId).eq("is_junk", false);
  const { data: have } = await sb.from("deal_insights").select("brand_id").eq("creator_id", creatorId);
  const done = new Set((have || []).map((h) => h.brand_id));
  const todo = (wall || []).filter((w) => !done.has(w.brand_id)).slice(0, 40);
  if (!todo.length) { await sb.from("creators").update({ insights_at: new Date().toISOString() }).eq("id", creatorId); return 0; }

  const month = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "unknown");
  const lines = todo.map((w, i) => `${i + 1}. ${w.brand} (${w.category || "uncategorized"}) · ${w.deals} deal${Number(w.deals) === 1 ? "" : "s"} · ${month(w.first_seen)}${w.last_seen && w.last_seen !== w.first_seen ? ` to ${month(w.last_seen)}` : ""}${w.repeat_partner ? " · repeat" : ""} · evidence: "${String(w.evidence || "").slice(0, 120)}"`).join("\n");
  const system = `You explain creator sponsorships to a talent manager. For each brand, write ONE sentence (max 22 words) on why this brand likely booked this creator at that time: connect the brand's category to the creator's audience and the season or calendar moment (holiday gifting, back to school, tax season, New Year fitness, summer travel, product launch, Prime Day, Super Bowl, Father's/Mother's Day, etc.). Be concrete and plausible, never invent facts you can't infer from the data; if the timing has no obvious hook, say what the content fit is instead. Also give a 2-4 word "season" tag or null.
Reply ONLY with JSON: {"items":[{"n":1,"why":"...","season":"..."|null}, ...]}`;
  const user = `Creator: ${creator.display_name || creator.handle} (@${creator.handle}, ${creator.platform}, ${creator.followers || "?"} followers, niche: ${creator.category || "?"})\nBio: ${String(creator.bio || "").slice(0, 200)}\n\nBrands:\n${lines}`;
  const msg = await client.messages.create({ model: MODEL, max_tokens: 2500, temperature: 0.3, system, messages: [{ role: "user", content: user }] });
  const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON from insights model");
  const parsed = JSON.parse(m[0]) as { items: { n: number; why: string; season: string | null }[] };
  const rows = (parsed.items || []).filter((it) => it.why && todo[it.n - 1]).map((it) => ({ creator_id: creatorId, brand_id: todo[it.n - 1].brand_id, why: String(it.why).slice(0, 240), season: it.season ? String(it.season).slice(0, 40) : null }));
  if (rows.length) await sb.from("deal_insights").upsert(rows, { onConflict: "creator_id,brand_id" });
  await sb.from("creators").update({ insights_at: new Date().toISOString() }).eq("id", creatorId);
  log(creator.handle, rows.length, "insights");
  return rows.length;
}

/** Idle-time backfill: creators scanned but not yet explained. */
export async function insightsBackfill(sb: SupabaseClient, limit = 2): Promise<number> {
  if (!client) return 0;
  const { data } = await sb.from("creators").select("id").not("last_scanned_at", "is", null).is("insights_at", null).order("last_scanned_at", { ascending: false }).limit(limit);
  let n = 0;
  for (const c of data || []) { try { n += await explainCreatorDeals(sb, c.id); } catch (e: any) { log("failed", c.id, e?.message); await sb.from("creators").update({ insights_at: new Date().toISOString() }).eq("id", c.id); } }
  return (data || []).length;
}
