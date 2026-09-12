// Receipt-printer sound: plays a REAL recording, no synthesis.
// Drop files at:
//   apps/web/public/sounds/receipt.mp3   the feed (2 to 5 s of a POS printer)
//   apps/web/public/sounds/cut.mp3       optional cutter clack
// If a file is missing the app stays silent. Browsers only start audio after a
// user gesture, so callers arm on the first click/tap where needed.

const FEED = "/sounds/receipt.mp3";
const CUT = "/sounds/cut.mp3";
const have = new Map<string, boolean>();
async function exists(src: string) {
  if (have.has(src)) return have.get(src)!;
  try { const r = await fetch(src, { method: "HEAD" }); const ok = r.ok && /audio|octet/.test(r.headers.get("content-type") || ""); have.set(src, ok); return ok; }
  catch { have.set(src, false); return false; }
}
let unlocked = false;
function make(src: string, vol: number) { const a = new Audio(src); a.preload = "auto"; a.volume = vol; return a; }

/** Play the feed for `feedMs`, then the cut. Returns true if playback started. */
export function playPrint(_steps = 16, feedMs = 4400): boolean {
  void (async () => {
    if (!(await exists(FEED))) return;
    const a = make(FEED, 0.6);
    try { await a.play(); unlocked = true; } catch { return; }
    setTimeout(() => { fade(a); void (async () => { if (await exists(CUT)) { const c = make(CUT, 0.7); c.play().catch(() => {}); } })(); }, feedMs);
  })();
  return unlocked;
}

/** A short burst (one line's worth). */
export function playChunk(): boolean {
  void (async () => {
    if (!(await exists(FEED))) return;
    const a = make(FEED, 0.5);
    try { await a.play(); unlocked = true; } catch { return; }
    setTimeout(() => fade(a), 350);
  })();
  return unlocked;
}

/** While a scan runs: play the feed in short runs with pauses. Returns a stop function. */
export function startWorkingLoop(): () => void {
  let stopped = false; let timer: any; let cur: HTMLAudioElement | null = null;
  const run = async () => {
    if (stopped || !(await exists(FEED))) return;
    cur = make(FEED, 0.45);
    try { await cur.play(); unlocked = true; } catch { armOnGesture(run); return; }
    const dur = 600 + Math.random() * 900;
    setTimeout(() => { if (cur) fade(cur); }, dur);
    timer = setTimeout(run, dur + 500 + Math.random() * 900);
  };
  void run();
  return () => { stopped = true; clearTimeout(timer); if (cur) fade(cur); };
}

function fade(a: HTMLAudioElement) {
  const step = () => { a.volume = Math.max(0, a.volume - 0.1); if (a.volume <= 0.01) { a.pause(); a.currentTime = 0; } else setTimeout(step, 30); };
  step();
}

/** Run `fn` on the first user gesture (or immediately if audio is already allowed). */
export function armOnGesture(fn: () => void) {
  if (unlocked) { fn(); return; }
  const once = () => { window.removeEventListener("pointerdown", once); window.removeEventListener("keydown", once); unlocked = true; fn(); };
  window.addEventListener("pointerdown", once, { once: true });
  window.addEventListener("keydown", once, { once: true });
}

/** Call inside a click handler: marks audio as allowed for the rest of the session. */
export function unlockAudio() { unlocked = true; }
