// One reading of a top post's opening, shared by the web print and the PDF.
// A short video has three channels and a viewer gets them in this order:
// what is SAID (audio), what is WRITTEN on the video, then the CAPTION under it.
// Every card shows all three in the same order with an explicit empty state,
// so nobody has to open the post to learn whether a line was spoken, sung,
// typed on screen, or only lives in the caption.

export type Audio = "voice" | "music" | "silent" | "no-voice" | "unread" | "no-audio" | "nofile" | "sound";
export type Source = "said" | "on-video" | "on-cover" | "caption";
export type Channel = { key: "voice" | "screen" | "caption"; label: string; text: string | null; empty: string | null };
export type HookRead = { source: Source; sourceLabel: string; lead: string; audio: Audio; audioLabel: string; channels: Channel[] };

export const decodeEntities = (s: string) => String(s || "")
  .replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");

const clean = (s: string | null | undefined) => (s == null ? null : decodeEntities(String(s)).replace(/\s+/g, " ").trim());

export function readHook(t: any, platform: string): HookRead {
  const spoken = clean(t.spoken), onVideo = clean(t.on_video), onCover = clean(t.on_screen), caption = clean(t.hook || t.title) || "";
  const lyrics = clean(t.lyrics);
  // audio: the worker's verdict when present; older prints only know "" (nothing transcribed) vs null (never listened)
  let audio: Audio;
  if (t.audio === "voice" || t.audio === "music" || t.audio === "silent" || t.audio === "unread" || t.audio === "nofile" || t.audio === "sound") audio = t.audio;
  else if (spoken) audio = "voice";
  else if (spoken === "") audio = "no-voice";
  else audio = platform === "youtube" || !String(t.kind || "").match(/reel|video|clip/i) ? "no-audio" : "unread";
  if (audio === "voice" && !spoken) audio = "no-voice";

  const audioLabel = {
    voice: "TALKING",
    music: "MUSIC, NO TALKING",
    silent: "NO SOUND",
    "no-voice": "NO TALKING",
    unread: "AUDIO NOT CHECKED",
    nofile: "NO VIDEO FILE (LICENSED AUDIO)",
    sound: "TRENDING SOUND, NOT THEM",
    "no-audio": "",
  }[audio];

  const screen = onVideo || onCover;
  let source: Source, lead: string;
  if (audio === "voice" && spoken) { source = "said"; lead = spoken; }
  else if (onVideo) { source = "on-video"; lead = onVideo; }
  else if (onCover) { source = "on-cover"; lead = onCover; }
  else { source = "caption"; lead = caption; }
  const sourceLabel = { said: "SAID OUT LOUD", "on-video": "TEXT ON VIDEO", "on-cover": "TEXT ON COVER", caption: "CAPTION ONLY" }[source];

  const voiceEmpty =
    audio === "music" ? (lyrics ? `Song only. Lyrics heard: "${lyrics}"` : "Nobody talks. Music only.")
    : audio === "silent" ? "No sound in the first seconds."
    : audio === "no-voice" ? "Nobody talks in the first 6 seconds (music or silence)."
    : audio === "nofile" ? "No video file from Instagram (licensed audio); caption and cover only."
    : audio === "sound" ? (lyrics ? `A reused sound, not them talking. It says: "${lyrics}"` : "A reused sound, not them talking.")
    : audio === "unread" ? "Not checked yet."
    : platform === "youtube" ? "Not available for YouTube." : "Photo post, no audio.";
  const screenEmpty = t.on_video === "" || t.on_screen === "" ? "No text on screen." : "Not read yet.";

  const channels: Channel[] = [
    { key: "voice", label: "VOICE", text: audio === "voice" ? spoken : null, empty: audio === "voice" ? null : voiceEmpty },
    { key: "screen", label: onVideo ? "ON VIDEO" : onCover ? "ON COVER" : "ON SCREEN", text: screen || null, empty: screen ? null : screenEmpty },
    { key: "caption", label: "CAPTION", text: caption || null, empty: caption ? null : "No caption." },
  ];
  return { source, sourceLabel, lead, audio, audioLabel, channels };
}

/** How the top posts open, as one sentence: "4 of the top 6 open with talking; 2 are music with text on screen." */
export function hookMix(top: any[], platform: string): string | null {
  const reads = top.map((t) => readHook(t, platform));
  if (!reads.length) return null;
  const n = reads.length;
  const talk = reads.filter((r) => r.source === "said").length;
  const noTalk = reads.filter((r) => r.audio === "music" || r.audio === "no-voice" || r.audio === "silent" || r.audio === "sound").length;
  const textLed = reads.filter((r) => r.source === "on-video" || r.source === "on-cover").length;
  const capOnly = reads.filter((r) => r.source === "caption").length;
  const parts: string[] = [];
  if (talk) parts.push(`${talk} open with talking`);
  if (noTalk) parts.push(`${noTalk} have no talking${textLed ? ` (${textLed} ${textLed === 1 ? "carries" : "carry"} the hook as text on screen)` : ""}`);
  else if (textLed) parts.push(`${textLed} lead with text on screen`);
  if (capOnly && !noTalk) parts.push(`${capOnly} rely on the caption alone`);
  return parts.length ? `Of the top ${n}, ${parts.join("; ")}.` : null;
}
