// Full transcripts. The hook pass hears six seconds of a creator's top six reels; this job
// hears every reel start to finish. For a queued transcript_jobs row: page the creator's
// Instagram media, download each reel Meta serves a file for, send the whole audio track to
// speech-to-text (Deepgram, or Whisper), and file one post_transcripts row per reel.
// Reels already filed are skipped, so a re-run only pays for new posts and an interrupted
// job picks up where it stopped. No model spend; Instagram calls come from the house pool.
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchIgCreator, IgRateLimitError, type IgToken } from "@creatorlens/engine";
import { FFMPEG, transcribeFull, meanVolume, looksLikeMusic, VOICE_CONF } from "./hooks";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[transcripts]", ...a);
const MAX_SECONDS = Number(process.env.TRANSCRIPT_MAX_SECONDS || 900);   // 15 minutes of audio per reel
const MAX_BYTES = Number(process.env.TRANSCRIPT_MAX_BYTES || 250_000_000);
const STALE_MS = 10 * 60e3;   // a "running" job untouched this long lost its worker (deploy, crash)
const ffmpeg = (args: string[]) => new Promise<void>((res, rej) => execFile(FFMPEG, args, { timeout: 180000 }, (e) => (e ? rej(e) : res())));
const clean = (h: string) => String(h || "").trim().replace(/^@/, "").toLowerCase();

type Row = { handle: string; url: string; published_at: string | null; caption: string | null; likes: number; comments: number; seconds: number | null; audio: "voice" | "music" | "silent" | "nofile" | "unread"; text: string | null; confidence: number | null };

/** Audio length from the wav header we just wrote: 16 kHz mono 16-bit = 32,000 bytes a second. */
const wavSeconds = (bytes: number) => Math.max(0, Math.round(((bytes - 44) / 32000) * 10) / 10);

async function hear(videoUrl: string, dir: string, n: number): Promise<Pick<Row, "seconds" | "audio" | "text" | "confidence">> {
  const src = path.join(dir, `${n}.mp4`), wav = path.join(dir, `${n}.wav`);
  try {
    const r = await fetch(videoUrl, { signal: AbortSignal.timeout(90000), headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`download ${r.status}`);
    if (Number(r.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("video too large");
    await fs.writeFile(src, Buffer.from(await r.arrayBuffer()));
    try { await ffmpeg(["-y", "-loglevel", "error", "-i", src, "-t", String(MAX_SECONDS), "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", wav]); }
    catch { return { seconds: null, audio: "silent", text: null, confidence: null }; }   // no audio track at all
    const buf = await fs.readFile(wav);
    const seconds = wavSeconds(buf.length);
    if (seconds < 0.5) return { seconds, audio: "silent", text: null, confidence: null };
    const heard = await transcribeFull(buf);
    if (heard == null) return { seconds, audio: "unread", text: null, confidence: null };
    const text = heard.text.replace(/[ \t]+/g, " ").trim();
    if (text && (heard.conf == null || heard.conf >= VOICE_CONF) && !looksLikeMusic(text)) return { seconds, audio: "voice", text, confidence: heard.conf };
    const vol = await meanVolume(wav);
    const audible = vol == null || vol > -50;
    return { seconds, audio: audible ? "music" : "silent", text: audible && text ? text : null, confidence: heard.conf };
  } finally { await fs.rm(src, { force: true }).catch(() => {}); await fs.rm(wav, { force: true }).catch(() => {}); }
}

export async function runTranscripts(sb: SupabaseClient, tokenFn: () => Promise<IgToken | null>): Promise<number> {
  if (!process.env.DEEPGRAM_API_KEY && !process.env.OPENAI_API_KEY) return 0;
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  const { data: jobs } = await sb.from("transcript_jobs").select("id,handle,max_posts,status,updated_at").or(`status.eq.queued,and(status.eq.running,updated_at.lt."${stale}")`).order("created_at").limit(1);
  const job = jobs?.[0];
  if (!job) return 0;
  // claim it: only one worker replica wins the update
  const { data: mine } = await sb.from("transcript_jobs").update({ status: "running", updated_at: new Date().toISOString(), error: null }).eq("id", job.id).eq("updated_at", job.updated_at).select("id");
  if (!mine?.length) return 0;
  const handle = clean(job.handle);
  const touch = (patch: Record<string, unknown>) => sb.from("transcript_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", job.id).then(() => {}, () => {});
  const tok = await tokenFn();
  if (!tok) { await touch({ status: "failed", error: "No Instagram connection available", finished_at: new Date().toISOString() }); return 0; }

  let posts;
  try { ({ posts } = await fetchIgCreator(tok, handle, Math.min(Math.max(job.max_posts || 500, 1), 2000), 50)); }
  catch (e: any) {
    if (e instanceof IgRateLimitError) { await touch({ status: "queued", error: "Instagram rate limit; will retry" }); log(handle, "rate limited; requeued"); return 0; }
    await touch({ status: "failed", error: String(e?.message || e).slice(0, 300), finished_at: new Date().toISOString() }); return 0;
  }
  const reels = posts.filter((p) => p.mediaType === "VIDEO" && p.permalink);
  const have = new Set<string>();
  for (let i = 0; i < reels.length; i += 200) {
    const { data } = await sb.from("post_transcripts").select("url,audio").in("url", reels.slice(i, i + 200).map((p) => p.permalink));
    for (const r of data || []) if (r.audio !== "unread") have.add(r.url);   // unread = speech-to-text failed; try again
  }
  const todo = reels.filter((p) => !have.has(p.permalink));
  await touch({ total: reels.length, done: 0, heard: 0 });
  log(handle, "reels", reels.length, "to transcribe", todo.length);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-"));
  let done = 0, heardN = 0;
  try {
    for (const [n, p] of todo.entries()) {
      const base = { handle, url: p.permalink, published_at: p.timestamp || null, caption: p.caption ? p.caption.slice(0, 4000) : null, likes: p.likes, comments: p.comments };
      let row: Row;
      // no file from Meta: a reel on licensed audio. Say so; there is nothing to listen to.
      if (!p.video) row = { ...base, seconds: null, audio: "nofile", text: null, confidence: null };
      else {
        try { row = { ...base, ...(await hear(p.video, dir, n)) }; }
        catch (e: any) { log("reel failed", p.permalink, String(e?.message || e).replace(/\s+/g, " ").slice(-160)); row = { ...base, seconds: null, audio: "unread", text: null, confidence: null }; }
      }
      const { error } = await sb.from("post_transcripts").upsert(row, { onConflict: "url" });
      if (error) log("save failed", p.permalink, error.message);
      done++; if (row.audio === "voice") heardN++;
      if (done % 5 === 0 || done === todo.length) await touch({ done, heard: heardN });
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  await touch({ status: "done", done, heard: heardN, finished_at: new Date().toISOString() });
  log(handle, "done:", done, "filed,", heardN, "with talking");
  return done;
}
