// The real hook: first six seconds of each top reel. Audio -> speech-to-text
// (Deepgram, or OpenAI Whisper if that's the key you have); three frames ->
// vision for burned-in captions. Instagram only: its API hands us the video
// file; YouTube doesn't. Budget-gated like the other optional work.
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordSpend, optionalBudgetOpen } from "./spend";

const MODEL = process.env.ANTHROPIC_COVERS_MODEL || "claude-haiku-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const DEEPGRAM = process.env.DEEPGRAM_API_KEY || "";
const OPENAI = process.env.OPENAI_API_KEY || "";
const SECONDS = Number(process.env.HOOK_SECONDS || 6);
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[hooks]", ...a);
const run = (cmd: string, args: string[]) => new Promise<void>((res, rej) => execFile(cmd, args, { timeout: 60000 }, (e) => (e ? rej(e) : res())));

async function transcribe(wav: Buffer): Promise<string | null> {
  if (DEEPGRAM) {
    const r = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true", { method: "POST", headers: { Authorization: `Token ${DEEPGRAM}`, "content-type": "audio/wav" }, body: new Uint8Array(wav) });
    if (!r.ok) { log("deepgram", r.status, (await r.text()).slice(0, 120)); return null; }
    const j: any = await r.json();
    return j?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  }
  if (OPENAI) {
    const fd = new FormData(); fd.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "hook.wav"); fd.append("model", "whisper-1");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${OPENAI}` }, body: fd });
    if (!r.ok) { log("whisper", r.status, (await r.text()).slice(0, 120)); return null; }
    const j: any = await r.json(); return j?.text || "";
  }
  return null;
}

export async function readHooks(sb: SupabaseClient, creatorId: string): Promise<number> {
  if (!DEEPGRAM && !OPENAI && !client) return 0;
  const modelOk = client ? await optionalBudgetOpen(sb).catch(() => false) : false;
  const { data: c } = await sb.from("creators").select("performance,platform").eq("id", creatorId).single();
  if (c?.platform !== "instagram") return 0;
  const perf = c.performance as any;
  const top: any[] = (perf?.top || []).slice(0, 6);
  const todo = top.map((t, i) => ({ t, i })).filter(({ t }) => t.video && t.spoken == null);
  if (!todo.length) return 0;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hook-"));
  let n = 0;
  const frames: { i: number; data: string }[] = [];
  try {
    for (const { t, i } of todo) {
      try {
        const mp4 = path.join(dir, `${i}.mp4`), wav = path.join(dir, `${i}.wav`);
        // first SECONDS only: stream-copy the head of the file, then split audio + 3 frames
        await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0", "-t", String(SECONDS), "-i", t.video, "-c", "copy", mp4]);
        await run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", wav]);
        const text = await transcribe(await fs.readFile(wav));
        t.spoken = text == null ? null : text.replace(/\s+/g, " ").trim().slice(0, 240);
        if (t.spoken != null) n++;
        for (const sec of [0.5, 2.5, 4.5]) {
          const jpg = path.join(dir, `${i}-${sec}.jpg`);
          await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(sec), "-i", mp4, "-frames:v", "1", "-vf", "scale=540:-1", jpg]).catch(() => {});
          try { frames.push({ i, data: (await fs.readFile(jpg)).toString("base64") }); } catch { /* no frame */ }
        }
      } catch (e: any) { log("clip failed", t.url, String(e?.message || e).slice(0, 120)); t.spoken = t.spoken ?? ""; }
    }
    // burned-in captions: one vision call for all frames
    if (client && modelOk && frames.length) {
      const content: any[] = [];
      for (const f of frames) { content.push({ type: "text", text: `Post ${f.i + 1}:` }); content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } }); }
      content.push({ type: "text", text: `These are frames from the first seconds of short videos, grouped by post number. For each post, transcribe the on-video caption/overlay text exactly as written (ignore platform UI, usernames, and watermarks). Combine the frames of a post into one string in order, without repeating text that appears in more than one frame. null if none. Reply ONLY with JSON: {"items":[{"n":1,"text":"..."|null}]}` });
      try {
        const msg = await client.messages.create({ model: MODEL, max_tokens: 900, temperature: 0, messages: [{ role: "user", content }] });
        recordSpend(sb, "hooks", MODEL, (msg as any).usage, creatorId).catch(() => {});
        const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
        const m = text.match(/\{[\s\S]*\}/);
        for (const it of (m ? JSON.parse(m[0]).items || [] : [])) { const idx = it.n - 1; if (top[idx]) top[idx].on_video = it.text ? String(it.text).replace(/\s+/g, " ").trim().slice(0, 240) : ""; }
      } catch (e: any) { log("frame read skipped:", String(e?.message || e).slice(0, 120)); }
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  for (const t of top) if (t.video) t.video = null;   // CDN links expire; never keep them
  await sb.from("creators").update({ performance: { ...perf, top: [...top, ...(perf.top || []).slice(6)] } }).eq("id", creatorId);
  log(creatorId, "spoken hooks", n, "of", todo.length);
  return n;
}
