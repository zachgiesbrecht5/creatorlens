"use client";
import { useEffect, useState } from "react";
import { PrinterMachine } from "@/components/PrinterMachine";
import { playPrint, armOnGesture } from "@/lib/print-sound";

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

export type Sample = { handle: string; platform: string; followers: string; lines: { brand: string; tag: string; when: string; deals: number; repeat?: boolean }[]; contact: string | null; href: string };

export function PrintReceipt({ indexDeals, samples = [] }: { indexDeals: number; samples?: Sample[] }) {
  const [run, setRun] = useState(0);   // bump to re-print
  const [lcd, setLcd] = useState("PRINTING…");
  const feed = () => { playPrint(); setRun((r) => r + 1); };
  useEffect(() => { setLcd("PRINTING…"); const t = setTimeout(() => setLcd("DONE ✓ TEAR"), 4700); return () => clearTimeout(t); }, [run]);
  // First load: browsers block sound until a gesture, so the first click or tap
  // anywhere on the page re-prints with sound.
  useEffect(() => { if (playPrint()) return; armOnGesture(() => setRun((r) => { playPrint(); return r + 1; })); }, []);
  const step = (_ms: number) => ({});   // lines ride the paper feed now; per-line delays unused
  // Real prints when we have them; the fictional sample only as a last resort.
  const pool: Sample[] = samples.length ? samples : [{ handle: "priyacooks", platform: "Instagram", followers: "312K", lines: LINES, contact: "Hearthline → d.reyes@hearthline.co", href: "#" }];
  const cur = pool[run % pool.length];
  const prev = pool.length > 1 ? [pool[(run + pool.length - 1) % pool.length], pool[(run + pool.length - 2) % pool.length]] : [];
  const totalDeals = cur.lines.reduce((s, l) => s + l.deals, 0);
  const repeats = cur.lines.filter((l) => l.repeat).length;

  return (
    <div className="rc-wrap">
      <PrinterMachine key={`m-${run}`} lcd={lcd} printing={lcd === "PRINTING…"} onFeed={feed} className="rc-machine-anim" />
      <div className="rc-feed">
      {prev.map((p, i) => (
        <a key={`ghost-${p.handle}-${run}`} href={p.href} className={`rc-ghost rc-ghost-${i + 1}`} aria-label={`print of @${p.handle}`}>
          <div className="rc-line rc-title"><span className="rc-handle">@{p.handle}</span><span className="rc-sub">{p.platform} · {p.followers}</span></div>
          {p.lines.slice(0, 4).map((l) => <div key={l.brand} className="rc-line rc-row"><span className="rc-brand">{l.brand}</span><span className="rc-tag">{l.tag}</span><span className="rc-when">{l.when}</span><span className="rc-deals">{l.deals}</span></div>)}
        </a>
      ))}
      <div className="rc-paper" key={`paper-${run}`}>
        <div className="rc-line rc-head" style={step(250)}>
          <span>sponsorprint</span>
          <span>print #{(48213 + run).toString()}</span>
        </div>
        <div className="rc-line rc-title" style={step(220)}>
          <span className="rc-handle">@{cur.handle}</span>
          <span className="rc-sub">{cur.platform} · {cur.followers} · {samples.length ? "printed" : "just now"}</span>
        </div>
        <div className="rc-rule" style={step(180)} />
        <div className="rc-line rc-cols" style={step(120)}>
          <span>brand</span><span>evidence</span><span>last</span><span>deals</span>
        </div>
        {cur.lines.map((l) => (
          <div key={l.brand} className="rc-line rc-row" style={step(260)}>
            <span className="rc-brand">{l.brand}{l.repeat && <em>repeat</em>}</span>
            <span className="rc-tag">{l.tag}</span>
            <span className="rc-when">{l.when}</span>
            <span className="rc-deals">{l.deals}</span>
          </div>
        ))}
        <div className="rc-rule" style={step(200)} />
        <div className="rc-line rc-total" style={step(200)}>
          <span>{cur.lines.length} brands · {totalDeals} deals · {repeats} repeat</span>
          <span className="rc-money">paid</span>
        </div>
        <div className="rc-line rc-contact" style={step(320)}>
          <span>{cur.contact || `${cur.lines[0]?.brand || "Top brand"} → contact on file`}</span>
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
