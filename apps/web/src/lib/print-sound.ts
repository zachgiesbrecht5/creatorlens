// Receipt-printer sounds, synthesised in the browser (no audio files).
// A thermal printer is a stepper motor stepping paper a hair at a time, so the
// sound is a fast train of tiny clicks ("zzzt") per line, not a hum. Each line
// gets a short burst of clicks plus a faint typewriter-style tick; the end is
// a paper tear. Browsers only start audio after a user gesture.

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

// one click: a 3ms noise impulse through a high bandpass, plus a tiny body thump
function click(c: AudioContext, out: AudioNode, at: number, vol: number, freq = 4200) {
  const len = Math.floor(c.sampleRate * 0.004);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq + Math.random() * 800; f.Q.value = 2.5;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(out); src.start(at); src.stop(at + 0.01);
  // body
  const o = c.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(190, at); o.frequency.exponentialRampToValueAtTime(90, at + 0.03);
  const og = c.createGain(); og.gain.setValueAtTime(vol * 0.35, at); og.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
  o.connect(og); og.connect(out); o.start(at); o.stop(at + 0.04);
}

// a line being printed: 10 to 14 stepper clicks 7ms apart = "zzzt"
function lineBurst(c: AudioContext, out: AudioNode, at: number, vol = 0.5) {
  const n = 10 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) click(c, out, at + i * 0.007, vol * (0.7 + Math.random() * 0.3), 3800);
}

function tear(c: AudioContext, out: AudioNode, at: number) {
  const dur = 0.28;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) { const p = i / len; d[i] = (Math.random() * 2 - 1) * (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85); }
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.setValueAtTime(1200, at); f.frequency.exponentialRampToValueAtTime(5200, at + dur); f.Q.value = 0.8;
  const g = c.createGain(); g.gain.value = 0.55;
  src.connect(f); f.connect(g); g.connect(out); src.start(at); src.stop(at + dur);
  // the serrated edge: a few crisp clicks as it rips
  for (let i = 0; i < 6; i++) click(c, out, at + 0.04 + i * 0.035, 0.35, 5200);
}

function master(c: AudioContext, vol = 0.6) { const g = c.createGain(); g.gain.value = vol; g.connect(c.destination); return g; }

/** One full print: a line burst per step, then the tear. Returns false if audio is blocked. */
export function playPrint(steps = 16, feedMs = 4400): boolean {
  const c = ac(); if (!c) return false;
  if (c.state === "suspended") { c.resume().catch(() => {}); }
  if (c.state !== "running") return false;
  const out = master(c);
  const t0 = c.currentTime + 0.05;
  for (let i = 0; i < steps; i++) lineBurst(c, out, t0 + (i / steps) * (feedMs / 1000));
  tear(c, out, t0 + feedMs / 1000 + 0.25);
  return true;
}

/** A single line. */
export function playChunk(): boolean {
  const c = ac(); if (!c || c.state !== "running") return false;
  lineBurst(c, master(c), c.currentTime + 0.01);
  return true;
}

/** Working loop for the scanning state: a line every 350 to 800ms, like a printer that's thinking between lines. */
export function startWorkingLoop(): () => void {
  const c = ac(); if (!c) return () => {};
  let stopped = false; let timer: any;
  const begin = () => {
    if (stopped || c.state !== "running") return;
    const out = master(c, 0.45);
    const tick = () => { if (stopped) return; lineBurst(c, out, c.currentTime + 0.01, 0.45); timer = setTimeout(tick, 350 + Math.random() * 450); };
    timer = setTimeout(tick, 300);
  };
  if (c.state === "running") begin();
  else armOnGesture(() => { c.resume().then(begin).catch(() => {}); });
  return () => { stopped = true; clearTimeout(timer); };
}

/** Run `fn` on the first user gesture (or immediately if audio is already allowed). */
export function armOnGesture(fn: () => void) {
  const c = ac();
  if (c && c.state === "running") { fn(); return; }
  const once = () => { window.removeEventListener("pointerdown", once); window.removeEventListener("keydown", once); const cc = ac(); if (cc) cc.resume().then(fn).catch(() => {}); else fn(); };
  window.addEventListener("pointerdown", once, { once: true });
  window.addEventListener("keydown", once, { once: true });
}

/** Call inside a click handler: unlocks audio for the rest of the session. */
export function unlockAudio() { const c = ac(); if (c && c.state === "suspended") c.resume().catch(() => {}); }
