// Brand watch. Weekly, read the last 25 posts of every brand that pays 2+
// creators and has a known Instagram handle. Flag launches, restocks, seasonal
// campaigns, giveaways and collabs; read the reel's spoken hook; compute the
// pitch window (second wave ~4-8 weeks out) and the seasonal re-push (~90 days).
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchIgCreator, type IgToken } from "@creatorlens/engine";
import { recordSpend, optionalBudgetOpen, noteModelError, cleanForModel } from "./spend";
import { clipHook } from "./hooks";

const MODEL = process.env.ANTHROPIC_SIGNALS_MODEL || "claude-haiku-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[brandwatch]", ...a);
const PER_RUN = Number(process.env.BRAND_WATCH_PER_RUN || 60);   // brands per run; runs every tick-hour until the week's list is done
const LAUNCH_RE = /\b(introduc|launch|just dropped|now available|new (?:drop|flavou?r|collection|arrival|formula|shade|product|line)|meet (?:the|our)|coming soon|pre-?order|restock|back in stock|limited edition|drop(?:s|ping)? (?:today|tomorrow|this|friday|monday)|giveaway|collab|x @)/i;

type Post = { id: string; caption: string; permalink: string; timestamp: string; likes: number; comments: number; mediaType: string; video?: string | null };

export async function brandWatch(sb: SupabaseClient, tokenFn: () => Promise<IgToken | null>): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  // brands worth watching: a handle, 2+ paying creators, not watched this week
  const { data: brands } = await sb.from("brands").select("id,name,ig_handle,brand_watched_at,creator_count").not("ig_handle", "is", null).eq("is_junk", false).gte("creator_count", 2).or(`brand_watched_at.is.null,brand_watched_at.lt.${weekAgo}`).order("creator_count", { ascending: false }).limit(PER_RUN);
  if (!brands?.length) return 0;
  let found = 0;
  for (const b of brands) {
    const tok = await tokenFn(); if (!tok) { log("no Instagram token; stopping"); break; }
    let posts: Post[] = [];
    try { posts = (await fetchIgCreator(tok, String(b.ig_handle).replace(/^@/, ""), 25, 25)).posts as Post[]; }
    catch (e: any) { log(b.name, "fetch failed", String(e?.message || e).slice(0, 100)); await sb.from("brands").update({ brand_watched_at: new Date().toISOString() }).eq("id", b.id); continue; }
    const recent = posts.filter((p) => Date.now() - new Date(p.timestamp).getTime() < 60 * 864e5);
    const candidates = recent.filter((p) => LAUNCH_RE.test(p.caption || ""));
    const { data: already } = candidates.length ? await sb.from("launch_signals").select("url").in("url", candidates.map((p) => p.permalink)) : { data: [] };
    const seen = new Set((already || []).map((x) => x.url));
    const fresh = candidates.filter((p) => !seen.has(p.permalink)).slice(0, 8);
    if (fresh.length && client && (await optionalBudgetOpen(sb))) {
      try {
        const user = cleanForModel(`Brand: ${b.name} (@${b.ig_handle}). For each post decide whether it announces something a creator-marketing team would run a campaign around, and classify it.\n\nkind: launch (new product/flavor/collection), restock, campaign (seasonal push, sale, event), giveaway, collab (with another brand or a creator), none.\nproduct: the product/collection name in a few words, or null.\nsummary: one plain sentence a talent manager would read, no hype.\n\nPosts:\n${fresh.map((p, i) => `${i + 1}. [${p.timestamp.slice(0, 10)}] ${String(p.caption || "").replace(/\\s+/g, " ").slice(0, 400)}`).join("\n")}\n\nReply ONLY with JSON: {"items":[{"n":1,"kind":"launch|restock|campaign|giveaway|collab|none","product":"..."|null,"summary":"..."}]}`);
        const msg = await client.messages.create({ model: MODEL, max_tokens: 1200, temperature: 0, messages: [{ role: "user", content: user }] });
        recordSpend(sb, "brandwatch", MODEL, (msg as any).usage, b.id).catch(() => {});
        const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join(""); const m = text.match(/\{[\s\S]*\}/);
        const items: { n: number; kind: string; product: string | null; summary: string }[] = m ? JSON.parse(m[0]).items || [] : [];
        let clips = 0;
        for (const it of items) {
          const p = fresh[it.n - 1]; if (!p || !it.kind || it.kind === "none") continue;
          const posted = new Date(p.timestamp);
          const d = (days: number) => new Date(posted.getTime() + days * 864e5).toISOString().slice(0, 10);
          let spoken: string | null = null, on_video: string | null = null;
          if (p.video && clips < 3) { clips++; const h = await clipHook(sb, p.video, b.id); spoken = h.spoken; on_video = h.on_video; }
          const { error } = await sb.from("launch_signals").upsert({ brand_id: b.id, kind: it.kind, product: it.product, summary: it.summary, posted_at: p.timestamp, url: p.permalink, caption: String(p.caption || "").slice(0, 600), spoken, on_video, window_start: d(28), window_end: d(56), repush_month: d(90).slice(0, 7) + "-01" }, { onConflict: "url", ignoreDuplicates: true });
          if (!error) found++;
        }
      } catch (e: any) { noteModelError(e); log(b.name, "classify failed", String(e?.message || e).slice(0, 120)); }
    }
    await sb.from("brands").update({ brand_watched_at: new Date().toISOString() }).eq("id", b.id);
  }
  log("watched", brands.length, "brands,", found, "new signals");
  return found;
}
