// Read the on-screen hook off each top post's cover image (YouTube thumbnail,
// Instagram reel cover). One vision call per print for up to 8 covers; about a
// cent and a half. Budget-gated like other optional work.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordSpend, optionalBudgetOpen } from "./spend";

const MODEL = process.env.ANTHROPIC_COVERS_MODEL || "claude-haiku-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[covers]", ...a);

export async function readCovers(sb: SupabaseClient, creatorId: string): Promise<number> {
  if (!client) return 0;
  if (!(await optionalBudgetOpen(sb))) return 0;
  const { data: c } = await sb.from("creators").select("performance").eq("id", creatorId).single();
  const perf = c?.performance as any;
  const top: any[] = (perf?.top || []).slice(0, 8);
  const todo = top.map((t, i) => ({ t, i })).filter(({ t }) => t.cover && t.on_screen == null);
  if (!todo.length) return 0;
  // fetch each cover as base64 (Instagram CDN URLs expire; read them now, not later)
  const images: { i: number; data: string; media_type: string }[] = [];
  for (const { t, i } of todo) {
    try {
      const r = await fetch(t.cover, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const ct = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
      if (!/^image\/(jpeg|png|webp|gif)$/.test(ct)) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 4_000_000) continue;
      images.push({ i, data: buf.toString("base64"), media_type: ct });
    } catch { /* skip */ }
  }
  if (!images.length) return 0;
  const content: any[] = [];
  for (const im of images) { content.push({ type: "text", text: `Image ${im.i + 1}:` }); content.push({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } }); }
  content.push({ type: "text", text: `For each image, transcribe the on-screen text exactly as written (the overlaid hook/title text, not the platform UI). If there is no readable text, write null. Reply ONLY with JSON: {"items":[{"n":1,"text":"..."|null}, ...]}` });
  const msg = await client.messages.create({ model: MODEL, max_tokens: 800, temperature: 0, messages: [{ role: "user", content }] });
  recordSpend(sb, "covers", MODEL, (msg as any).usage, creatorId).catch(() => {});
  const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  const m = text.match(/\{[\s\S]*\}/);
  let items: { n: number; text: string | null }[] = [];
  try { items = m ? JSON.parse(m[0]).items || [] : []; } catch { items = []; }
  let n = 0;
  for (const it of items) { const idx = it.n - 1; if (top[idx]) { top[idx].on_screen = it.text ? String(it.text).replace(/\s+/g, " ").trim().slice(0, 140) : ""; n++; } }
  // covers from Instagram's CDN expire; drop the URL once read so nothing links to a dead image
  for (const t of top) if (t.cover && /cdninstagram|fbcdn/.test(t.cover)) t.cover = null;   // (video urls are cleared by hooks.ts after use)
  await sb.from("creators").update({ performance: { ...perf, top: [...top, ...(perf.top || []).slice(8)] } }).eq("id", creatorId);
  log(creatorId, "read", n, "covers");
  return n;
}
