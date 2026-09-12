"use client";
import { useState } from "react";
import { PrinterMachine } from "@/components/PrinterMachine";

// The hero: a sponsor print coming out of the machine, one line at a time.
// Pure CSS animation (see .rc-* in globals.css); honours prefers-reduced-motion.
// Everything on it is fictional: the point is the shape of the thing you get.

const LINES: { brand: string; tag: string; when: string; deals: number; repeat?: boolean }[] = [
  { brand: "Hearthline", tag: "#hearthlineptnr", when: "Aug 2026", deals: 3, repeat: true },
  { brand: "Fieldnote", tag: "@fieldnote.coffee", when: "Jul 2026", deals: 1 },
  { brand: "Loom & Ladle", tag: "#loomandladle #ad", when: "Jun 2026", deals: 2, repeat: true },
  { brand: "Northbay Knives", tag: "paid partnership", when: "May 2026", deals: 1 },
  { brand: "Brightstem", tag: "#brightstem #ad", when: "Mar 2026", deals: 1 },
  { brand: "Saltmarsh", tag: "@saltmarsh.pantry", when: "Jan 2026", deals: 1 },
];

// Thermal printer sound, synthesised (no audio file): a motor hum plus one
// noise "chunk" per feed step, then a paper tear. Browsers only allow audio
// after a user gesture, so it plays when someone presses FEED.
function playPrintSound(steps = 16, feedMs = 4400) {
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  const ctx: AudioContext = new AC();
  const t0 = ctx.currentTime + 0.05;
  const master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  const noise = (start: number, dur: number, freq: number, q: number, vol: number) => {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(start); src.stop(start + dur);
  };
  // motor hum under the whole feed
  const hum = ctx.createOscillator(); hum.type = "sawtooth"; hum.frequency.value = 62;
  const hf = ctx.createBiquadFilter(); hf.type = "lowpass"; hf.frequency.value = 220;
  const hg = ctx.createGain(); hg.gain.setValueAtTime(0.0001, t0); hg.gain.exponentialRampToValueAtTime(0.08, t0 + 0.05);
  hg.gain.setValueAtTime(0.08, t0 + feedMs / 1000 - 0.05); hg.gain.exponentialRampToValueAtTime(0.0001, t0 + feedMs / 1000 + 0.05);
  hum.connect(hf); hf.connect(hg); hg.connect(master); hum.start(t0); hum.stop(t0 + feedMs / 1000 + 0.1);
  // one chunk per line
  for (let i = 0; i < steps; i++) {
    const at = t0 + (i / steps) * (feedMs / 1000);
    noise(at, 0.07, 2600 + Math.random() * 600, 1.2, 0.35);
    noise(at + 0.02, 0.04, 900, 2, 0.2);
  }
  // tear
  const tearAt = t0 + feedMs / 1000 + 0.25;
  noise(tearAt, 0.22, 1800, 0.7, 0.6);
  noise(tearAt + 0.05, 0.18, 4200, 0.9, 0.3);
}

export function PrintReceipt({ indexDeals }: { indexDeals: number }) {
  const [run, setRun] = useState(0);   // bump to re-print
  const feed = () => { playPrintSound(); setRun((r) => r + 1); };
  const step = (_ms: number) => ({});   // lines ride the paper feed now; per-line delays unused
  const totalDeals = LINES.reduce((s, l) => s + l.deals, 0);
  const repeats = LINES.filter((l) => l.repeat).length;

  return (
    <div className="rc-wrap">
      <PrinterMachine key={`m-${run}`} lcd={undefined} lines={undefined} printing onFeed={feed} className="rc-machine-anim" />
      <div className="rc-feed">
      <div className="rc-paper" key={`paper-${run}`}>
        <div className="rc-line rc-head" style={step(250)}>
          <span>sponsorprint</span>
          <span>print #48213</span>
        </div>
        <div className="rc-line rc-title" style={step(220)}>
          <span className="rc-handle">@priyacooks</span>
          <span className="rc-sub">Instagram · 312K · just now</span>
        </div>
        <div className="rc-rule" style={step(180)} />
        <div className="rc-line rc-cols" style={step(120)}>
          <span>brand</span><span>evidence</span><span>last</span><span>deals</span>
        </div>
        {LINES.map((l) => (
          <div key={l.brand} className="rc-line rc-row" style={step(260)}>
            <span className="rc-brand">{l.brand}{l.repeat && <em>repeat</em>}</span>
            <span className="rc-tag">{l.tag}</span>
            <span className="rc-when">{l.when}</span>
            <span className="rc-deals">{l.deals}</span>
          </div>
        ))}
        <div className="rc-rule" style={step(200)} />
        <div className="rc-line rc-total" style={step(200)}>
          <span>{LINES.length} brands · {totalDeals} deals · {repeats} repeat</span>
          <span className="rc-money">paid</span>
        </div>
        <div className="rc-line rc-contact" style={step(320)}>
          <span>Hearthline → d.reyes@hearthline.co</span>
          <span className="rc-draft">Draft pitch</span>
        </div>
        <div className="rc-line rc-foot" style={step(240)}>
          <span>index total {indexDeals.toLocaleString()} deals</span>
          <span>public posts only</span>
        </div>
        <div className="rc-tear" />
      </div>
      </div>
    </div>
  );
}
