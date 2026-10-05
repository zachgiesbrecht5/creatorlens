// The real hook: first six seconds of each top reel. Audio -> speech-to-text
// (Deepgram, or OpenAI Whisper if that's the key you have); three frames ->
// vision for burned-in captions. Instagram only: its API hands us the video
// file; YouTube doesn't. Budget-gated like the other optional work.
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import ffmpegStatic from "ffmpeg-static";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordSpend, optionalBudgetOpen, noteModelError } from "./spend";

const MODEL = process.env.ANTHROPIC_COVERS_MODEL || "claude-haiku-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const DEEPGRAM = process.env.DEEPGRAM_API_KEY || "";
const OPENAI = process.env.OPENAI_API_KEY || "";
const SECONDS = Number(process.env.HOOK_SECONDS || 6);
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[hooks]", ...a);
// ffmpeg: the bundled static binary (installs with npm, no build-system dependency), falling back to a system one
const FFMPEG = (ffmpegStatic as unknown as string) || "ffmpeg";
const run = (_cmd: string, args: string[]) => new Promise<void>((res, rej) => execFile(FFMPEG, args, { timeout: 60000 }, (e) => (e ? rej(e) : res())));

type Heard = { text: string; conf: number | null } | null;
async function transcribeFull(wav: Buffer): Promise<Heard> {
  if (DEEPGRAM) {
    const r = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true", { method: "POST", headers: { Authorization: `Token ${DEEPGRAM}`, "content-type": "audio/wav" }, body: new Uint8Array(wav) });
    if (!r.ok) { log("deepgram", r.status, (await r.text()).slice(0, 120)); return null; }
    const j: any = await r.json();
    const alt = j?.results?.channels?.[0]?.alternatives?.[0];
    return { text: alt?.transcript || "", conf: typeof alt?.confidence === "number" ? alt.confidence : null };
  }
  if (OPENAI) {
    const fd = new FormData(); fd.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "hook.wav"); fd.append("model", "whisper-1"); fd.append("response_format", "verbose_json");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${OPENAI}` }, body: fd });
    if (!r.ok) { log("whisper", r.status, (await r.text()).slice(0, 120)); return null; }
    const j: any = await r.json();
    // Whisper invents words over music; its own no-speech probability is the tell
    const segs: any[] = j?.segments || [];
    const noSpeech = segs.length ? segs.reduce((a, s) => a + Number(s.no_speech_prob || 0), 0) / segs.length : 0;
    return { text: j?.text || "", conf: segs.length ? 1 - noSpeech : null };
  }
  return null;
}

/** Mean loudness of a wav in dB (ffmpeg volumedetect); -91 = digital silence. */
function meanVolume(wavPath: string): Promise<number | null> {
  return new Promise((res) => execFile(FFMPEG, ["-hide_banner", "-i", wavPath, "-af", "volumedetect", "-f", "null", "-"], { timeout: 30000 }, (_e, _o, err) => {
    const m = String(err || "").match(/mean_volume:\s*(-?[\d.]+) dB/); res(m ? Number(m[1]) : null);
  }));
}

const VOICE_CONF = Number(process.env.HOOK_VOICE_CONFIDENCE || 0.55);
/** What a viewer hears in the opening: talking, a song (lyrics are not a hook), or nothing. */
// "Bob. Bob. Bob." / "yeah yeah yeah yeah": a vocal chop on a beat, not a sentence
function looksLikeMusic(t: string): boolean {
  const words = String(t || "").toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  const uniq = new Set(words).size;
  return uniq / words.length < 0.34 || (words.length >= 6 && uniq <= 2);
}
async function listen(wavPath: string): Promise<{ spoken: string | null; audio: "voice" | "music" | "silent" | "unread"; lyrics: string | null }> {
  const heard = await transcribeFull(await fs.readFile(wavPath));
  if (heard == null) return { spoken: null, audio: "unread", lyrics: null };
  const text = heard.text.replace(/\s+/g, " ").trim().slice(0, 240);
  if (text && (heard.conf == null || heard.conf >= VOICE_CONF) && !looksLikeMusic(text)) return { spoken: text, audio: "voice", lyrics: null };
  const vol = await meanVolume(wavPath);
  const audible = vol == null || vol > -50;
  // low-confidence words over audible sound are almost always sung lyrics
  if (text) return { spoken: "", audio: audible ? "music" : "silent", lyrics: audible ? text : null };
  return { spoken: "", audio: audible ? "music" : "silent", lyrics: null };
}

/** Read the first SECONDS of one video: spoken line (Deepgram/Whisper) and burned-in text (vision). Used by the brand watch too. */
export async function clipHook(sb: SupabaseClient, videoUrl: string, ref?: string): Promise<{ spoken: string | null; on_video: string | null }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clip-"));
  try {
    const src = path.join(dir, "src.mp4"), mp4 = path.join(dir, "h.mp4"), wav = path.join(dir, "h.wav");
    const r = await fetch(videoUrl, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return { spoken: null, on_video: null };
    await fs.writeFile(src, Buffer.from(await r.arrayBuffer()));
    await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0", "-t", String(SECONDS), "-i", src, "-c", "copy", mp4]);
    let spoken: string | null = null;
    try { await run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", wav]); const h = await listen(wav); spoken = h.audio === "unread" ? null : h.spoken; } catch { spoken = ""; }
    let on_video: string | null = null;
    if (client && (await optionalBudgetOpen(sb).catch(() => false))) {
      const frames: string[] = [];
      for (const sec of [0.5, 2.5, 4.5]) { const jpg = path.join(dir, `f${sec}.jpg`); await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(sec), "-i", mp4, "-frames:v", "1", "-vf", "scale=540:-1", jpg]).catch(() => {}); try { frames.push((await fs.readFile(jpg)).toString("base64")); } catch { /* none */ } }
      if (frames.length) {
        try {
          const content: any[] = frames.map((d) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: d } }));
          content.push({ type: "text", text: `Frames from the first seconds of a short video. Transcribe the on-video caption/overlay text exactly as written, combined in order without repeats (ignore platform UI and usernames). Reply ONLY with JSON: {"text": "..."|null}` });
          const msg = await client.messages.create({ model: MODEL, max_tokens: 300, temperature: 0, messages: [{ role: "user", content }] });
          recordSpend(sb, "hooks", MODEL, (msg as any).usage, ref).catch(() => {});
          const t = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join(""); const m = t.match(/\{[\s\S]*\}/);
          on_video = m ? (JSON.parse(m[0]).text || "") : "";
        } catch { on_video = null; }
      }
    }
    return { spoken: spoken == null ? null : spoken.replace(/\s+/g, " ").trim().slice(0, 240), on_video: on_video == null ? null : String(on_video).replace(/\s+/g, " ").trim().slice(0, 240) };
  } catch { return { spoken: null, on_video: null }; } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

export async function readHooks(sb: SupabaseClient, creatorId: string): Promise<number> {
  if (!DEEPGRAM && !OPENAI && !client) return 0;
  const modelOk = client ? await optionalBudgetOpen(sb).catch(() => false) : false;
  const { data: c } = await sb.from("creators").select("performance,platform").eq("id", creatorId).single();
  if (c?.platform !== "instagram") return 0;
  const perf = c.performance as any;
  const top: any[] = (perf?.top || []).slice(0, 6);
  // reels with no file from Meta (licensed audio): say so, don't leave them "unread"
  let marked = 0;
  for (const t of top) if (!t.video && t.spoken == null && /reel|video|clip/i.test(String(t.kind || ""))) { t.audio = "nofile"; t.spoken = ""; marked++; }
  const todo = top.map((t, i) => ({ t, i })).filter(({ t }) => t.video && t.spoken == null);
  if (!todo.length && marked) { await sb.from("creators").update({ performance: { ...perf, top: [...top, ...(perf.top || []).slice(6)] } }).eq("id", creatorId); return 0; }
  if (!todo.length) return 0;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hook-"));
  let n = 0;
  const frames: { i: number; data: string }[] = [];
  try {
    for (const { t, i } of todo) {
      try {
        const src = path.join(dir, `${i}-src.mp4`), mp4 = path.join(dir, `${i}.mp4`), wav = path.join(dir, `${i}.wav`);
        // download the reel (the static ffmpeg can't read https), then cut the first SECONDS locally
        const r = await fetch(t.video, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "Mozilla/5.0" } });
        if (!r.ok) throw new Error(`download ${r.status}`);
        const len = Number(r.headers.get("content-length") || 0);
        if (len > 60_000_000) throw new Error("video too large");
        await fs.writeFile(src, Buffer.from(await r.arrayBuffer()));
        await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0", "-t", String(SECONDS), "-i", src, "-c", "copy", mp4]);
        await fs.rm(src, { force: true });
        await run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", wav]);
        const h = await listen(wav);
        t.spoken = h.spoken; t.audio = h.audio; t.lyrics = h.lyrics;
        if (t.spoken != null) n++;
        for (const sec of [0.5, 2.5, 4.5]) {
          const jpg = path.join(dir, `${i}-${sec}.jpg`);
          await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(sec), "-i", mp4, "-frames:v", "1", "-vf", "scale=540:-1", jpg]).catch(() => {});
          try { frames.push({ i, data: (await fs.readFile(jpg)).toString("base64") }); } catch { /* no frame */ }
        }
      } catch (e: any) { log("clip failed", t.url, String(e?.message || e).replace(/\s+/g, " ").slice(-160)); t.spoken = t.spoken ?? ""; t.audio = t.audio ?? "unread"; }
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
