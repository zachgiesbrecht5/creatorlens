// Thermal printer sounds, synthesised in the browser (no audio files).
// Browsers only let audio start after a user gesture; `armOnGesture` waits
// for the first click/tap/key and then plays.

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function noise(c: AudioContext, out: AudioNode, start: number, dur: number, freq: number, q: number, vol: number) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  src.connect(f); f.connect(g); g.connect(out); src.start(start); src.stop(start + dur);
}

/** One full print: hum, one chunk per step, then a tear. Returns false if audio is blocked. */
export function playPrint(steps = 16, feedMs = 4400): boolean {
  const c = ac(); if (!c) return false;
  if (c.state === "suspended") { c.resume().catch(() => {}); }
  if (c.state !== "running") return false;
  const t0 = c.currentTime + 0.05;
  const master = c.createGain(); master.gain.value = 0.5; master.connect(c.destination);
  const hum = c.createOscillator(); hum.type = "sawtooth"; hum.frequency.value = 62;
  const hf = c.createBiquadFilter(); hf.type = "lowpass"; hf.frequency.value = 220;
  const hg = c.createGain(); hg.gain.setValueAtTime(0.0001, t0); hg.gain.exponentialRampToValueAtTime(0.08, t0 + 0.05);
  hg.gain.setValueAtTime(0.08, t0 + feedMs / 1000 - 0.05); hg.gain.exponentialRampToValueAtTime(0.0001, t0 + feedMs / 1000 + 0.05);
  hum.connect(hf); hf.connect(hg); hg.connect(master); hum.start(t0); hum.stop(t0 + feedMs / 1000 + 0.1);
  for (let i = 0; i < steps; i++) {
    const at = t0 + (i / steps) * (feedMs / 1000);
    noise(c, master, at, 0.07, 2600 + Math.random() * 600, 1.2, 0.35);
    noise(c, master, at + 0.02, 0.04, 900, 2, 0.2);
  }
  const tearAt = t0 + feedMs / 1000 + 0.25;
  noise(c, master, tearAt, 0.22, 1800, 0.7, 0.6);
  noise(c, master, tearAt + 0.05, 0.18, 4200, 0.9, 0.3);
  return true;
}

/** A single chunk (one line). */
export function playChunk(): boolean {
  const c = ac(); if (!c || c.state !== "running") return false;
  const master = c.createGain(); master.gain.value = 0.35; master.connect(c.destination);
  noise(c, master, c.currentTime, 0.07, 2600 + Math.random() * 600, 1.2, 0.35);
  noise(c, master, c.currentTime + 0.02, 0.04, 900, 2, 0.2);
  return true;
}

/** Continuous "working" loop for the scanning state: low hum + a chunk every ~700ms. Returns a stop function. */
export function startWorkingLoop(): () => void {
  const c = ac(); if (!c) return () => {};
  let stopped = false; let timer: any;
  let hum: OscillatorNode | null = null; let hg: GainNode | null = null;
  const begin = () => {
    if (stopped || c.state !== "running") return;
    hum = c.createOscillator(); hum.type = "sawtooth"; hum.frequency.value = 58;
    const hf = c.createBiquadFilter(); hf.type = "lowpass"; hf.frequency.value = 200;
    hg = c.createGain(); hg.gain.setValueAtTime(0.0001, c.currentTime); hg.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.3);
    hum.connect(hf); hf.connect(hg); hg.connect(c.destination); hum.start();
    const tick = () => { if (stopped) return; playChunk(); timer = setTimeout(tick, 500 + Math.random() * 500); };
    timer = setTimeout(tick, 400);
  };
  if (c.state === "running") begin();
  else armOnGesture(() => { c.resume().then(begin).catch(() => {}); });
  return () => {
    stopped = true; clearTimeout(timer);
    if (hum && hg) { try { hg.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2); hum.stop(c.currentTime + 0.25); } catch { /* already stopped */ } }
  };
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
