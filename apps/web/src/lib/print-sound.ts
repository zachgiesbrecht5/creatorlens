// Receipt printer sound, synthesised in the browser. A low, warm motor whirr
// (two detuned saws under a 900 Hz lowpass) with a soft paper rustle over it,
// sustained for the feed, then a muted two-part cutter clack. Nothing above
// ~1.6 kHz, so it sits in the background instead of cutting through.
// Browsers only start audio after a user gesture.

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/**
 * The feed: a low motor grind with a soft paper rustle over it. Everything sits
 * under ~1.5 kHz so it's a warm mechanical whirr, not a whine.
 */
function buzz(c: AudioContext, at: number, dur: number, vol = 0.32) {
  const master = c.createGain(); master.gain.value = vol; master.connect(c.destination);
  // motor: two detuned saws, low, through a gentle lowpass
  const mk = (f: number) => { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; return o; };
  const o1 = mk(92), o2 = mk(92 * 1.5 + 1.3);
  const wob = c.createOscillator(); wob.type = "sine"; wob.frequency.value = 14;
  const wobG = c.createGain(); wobG.gain.value = 2.5; wob.connect(wobG); wobG.connect(o1.frequency); wobG.connect(o2.frequency);
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.Q.value = 0.7;
  const tg = c.createGain();
  tg.gain.setValueAtTime(0.0001, at); tg.gain.exponentialRampToValueAtTime(0.5, at + 0.09);
  tg.gain.setValueAtTime(0.5, at + dur - 0.08); tg.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o1.connect(lp); o2.connect(lp); lp.connect(tg); tg.connect(master);
  // paper rustle: soft noise band, gently modulated so it feels mechanical
  const len = Math.floor(c.sampleRate * (dur + 0.1));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) { const t = i / c.sampleRate; const g = 0.7 + 0.3 * Math.sin(t * 46 * 2 * Math.PI); d[i] = (Math.random() * 2 - 1) * g; }
  const src = c.createBufferSource(); src.buffer = buf;
  const nb = c.createBiquadFilter(); nb.type = "bandpass"; nb.frequency.value = 1100; nb.Q.value = 0.6;
  const nl = c.createBiquadFilter(); nl.type = "lowpass"; nl.frequency.value = 1600;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, at); ng.gain.exponentialRampToValueAtTime(0.22, at + 0.12);
  ng.gain.setValueAtTime(0.22, at + dur - 0.08); ng.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(nb); nb.connect(nl); nl.connect(ng); ng.connect(master);
  o1.start(at); o2.start(at); wob.start(at); src.start(at);
  o1.stop(at + dur + 0.05); o2.stop(at + dur + 0.05); wob.stop(at + dur + 0.05); src.stop(at + dur + 0.05);
  return master;
}

/** The cutter: two short clacks. */
function cutter(c: AudioContext, at: number) {
  const master = c.createGain(); master.gain.value = 0.45; master.connect(c.destination);
  for (const [dt, f] of [[0, 700], [0.08, 420]] as const) {
    const len = Math.floor(c.sampleRate * 0.03);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 1.5;
    src.connect(bp); bp.connect(master); src.start(at + dt); src.stop(at + dt + 0.04);
    const o = c.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(110, at + dt); o.frequency.exponentialRampToValueAtTime(50, at + dt + 0.05);
    const g = c.createGain(); g.gain.setValueAtTime(0.25, at + dt); g.gain.exponentialRampToValueAtTime(0.0001, at + dt + 0.05);
    o.connect(g); g.connect(master); o.start(at + dt); o.stop(at + dt + 0.06);
  }
}

/** One full print: continuous buzz for the feed, then the cutter. Returns false if audio is blocked. */
export function playPrint(_steps = 16, feedMs = 4400): boolean {
  const c = ac(); if (!c) return false;
  if (c.state === "suspended") { c.resume().catch(() => {}); }
  if (c.state !== "running") return false;
  const t0 = c.currentTime + 0.05;
  buzz(c, t0, feedMs / 1000);
  cutter(c, t0 + feedMs / 1000 + 0.15);
  return true;
}

/** A short burst (one line's worth). */
export function playChunk(): boolean {
  const c = ac(); if (!c || c.state !== "running") return false;
  buzz(c, c.currentTime + 0.01, 0.25, 0.3);
  return true;
}

/** Working loop for the scanning state: the printer feeds in short runs, pauses, feeds again. */
export function startWorkingLoop(): () => void {
  const c = ac(); if (!c) return () => {};
  let stopped = false; let timer: any; let current: GainNode | null = null;
  const begin = () => {
    if (stopped || c.state !== "running") return;
    const run = () => {
      if (stopped) return;
      const dur = 0.5 + Math.random() * 0.9;
      current = buzz(c, c.currentTime + 0.01, dur, 0.28);
      timer = setTimeout(run, (dur + 0.4 + Math.random() * 0.8) * 1000);
    };
    run();
  };
  if (c.state === "running") begin();
  else armOnGesture(() => { c.resume().then(begin).catch(() => {}); });
  return () => {
    stopped = true; clearTimeout(timer);
    if (current) { try { current.gain.setTargetAtTime(0.0001, c.currentTime, 0.05); } catch { /* fine */ } }
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
