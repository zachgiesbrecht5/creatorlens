// Point-of-sale receipt printer sound, synthesised in the browser.
// A supermarket printer doesn't click line by line; it makes one continuous
// high buzz ("brrrrrrt") for the length of the print while the paper hisses
// out, then the cutter goes clack. That's what this makes:
//   - a narrow pulse train (~210 Hz) shaped through a 2.4 kHz bandpass = the buzz
//   - a hiss band that rides on the same pulse = paper through the mechanism
//   - a small wobble so it isn't a perfect tone
//   - two short cutter clacks at the end
// Browsers only start audio after a user gesture.

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

let pulseWave: PeriodicWave | null = null;
function pulse(c: AudioContext) {
  // narrow pulse = rich harmonics; that's the "electric" edge of the buzz
  if (pulseWave) return pulseWave;
  const n = 40, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) { const duty = 0.18; im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty); }
  pulseWave = c.createPeriodicWave(re, im);
  return pulseWave;
}

/** The buzz for `dur` seconds starting at `at`. Returns the master gain so callers can stop it early. */
function buzz(c: AudioContext, at: number, dur: number, vol = 0.5) {
  const master = c.createGain(); master.gain.value = vol; master.connect(c.destination);
  // motor tone
  const o = c.createOscillator(); o.setPeriodicWave(pulse(c)); o.frequency.value = 210;
  const wob = c.createOscillator(); wob.type = "sine"; wob.frequency.value = 27;
  const wobG = c.createGain(); wobG.gain.value = 4; wob.connect(wobG); wobG.connect(o.frequency);
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 1.1;
  const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 700;
  const tg = c.createGain();
  tg.gain.setValueAtTime(0.0001, at); tg.gain.exponentialRampToValueAtTime(0.9, at + 0.06);
  tg.gain.setValueAtTime(0.9, at + dur - 0.05); tg.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(bp); bp.connect(hp); hp.connect(tg); tg.connect(master);
  // paper hiss, gated by the same pulse rate so it chatters with the motor
  const len = Math.floor(c.sampleRate * (dur + 0.1));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) { const t = i / c.sampleRate; const gate = 0.55 + 0.45 * Math.max(0, Math.sin(t * 210 * 2 * Math.PI)); d[i] = (Math.random() * 2 - 1) * gate; }
  const src = c.createBufferSource(); src.buffer = buf;
  const nb = c.createBiquadFilter(); nb.type = "bandpass"; nb.frequency.value = 4800; nb.Q.value = 0.9;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, at); ng.gain.exponentialRampToValueAtTime(0.28, at + 0.08);
  ng.gain.setValueAtTime(0.28, at + dur - 0.05); ng.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(nb); nb.connect(ng); ng.connect(master);
  o.start(at); wob.start(at); src.start(at);
  o.stop(at + dur + 0.05); wob.stop(at + dur + 0.05); src.stop(at + dur + 0.05);
  return master;
}

/** The cutter: two short clacks. */
function cutter(c: AudioContext, at: number) {
  const master = c.createGain(); master.gain.value = 0.7; master.connect(c.destination);
  for (const [dt, f] of [[0, 1500], [0.07, 900]] as const) {
    const len = Math.floor(c.sampleRate * 0.03);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 1.5;
    src.connect(bp); bp.connect(master); src.start(at + dt); src.stop(at + dt + 0.04);
    const o = c.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(140, at + dt); o.frequency.exponentialRampToValueAtTime(60, at + dt + 0.04);
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
  buzz(c, c.currentTime + 0.01, 0.22, 0.45);
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
      current = buzz(c, c.currentTime + 0.01, dur, 0.4);
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
