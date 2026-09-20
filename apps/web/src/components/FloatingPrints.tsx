import Link from "next/link";
import type { Sample } from "@/components/PrintReceipt";

// Real prints floating behind the hero: creator photo, name, and brand rows
// with the brand's favicon. Small, in the gutters, always moving.
const SLOTS = [
  { left: "1%",  top: "2%",  rot: -6, dur: 14, delay: 0,   w: 230 },
  { left: "3%",  top: "64%", rot: 4,  dur: 17, delay: -6,  w: 210 },
  { left: "30%", top: "72%", rot: -3, dur: 15, delay: -11, w: 220 },
  { left: "46%", top: "-4%", rot: 5,  dur: 16, delay: -3,  w: 210 },
  { left: "86%", top: "0%",  rot: 7,  dur: 18, delay: -9,  w: 200 },
  { left: "84%", top: "66%", rot: -5, dur: 13, delay: -14, w: 220 },
];
const fav = (d: string) => `https://www.google.com/s2/favicons?domain=${d}&sz=32`;

export function FloatingPrints({ samples }: { samples: Sample[] }) {
  if (!samples.length) return null;
  return (
    <div className="fp" aria-hidden>
      {SLOTS.map((sl, i) => {
        const p = samples[i % samples.length];
        return (
          <Link key={i} href={p.href} className="fp-print" style={{ left: sl.left, top: sl.top, width: sl.w, ["--rot" as any]: `${sl.rot}deg`, ["--dur" as any]: `${sl.dur}s`, ["--delay" as any]: `${sl.delay}s` }}>
            <div className="fp-id">
              {p.avatar ? <img src={p.avatar} alt="" className="fp-avatar" /> : <span className="fp-avatar fp-avatar-blank" />}
              <div className="min-w-0"><div className="fp-name">{p.name || `@${p.handle}`}</div><div className="fp-meta">{p.platform} · {p.followers}</div></div>
            </div>
            {p.lines.slice(0, 4).map((l) => (
              <div key={l.brand} className="fp-row">
                {l.domain ? <img src={fav(l.domain)} alt="" className="fp-fav" /> : <span className="fp-fav fp-fav-blank" />}
                <span className="fp-brand">{l.brand}</span>
                <span className="fp-when">{l.when}</span>
              </div>
            ))}
            <div className="fp-foot">{p.lines.length} brands · paid</div>
            <div className="fp-tear" />
          </Link>
        );
      })}
    </div>
  );
}
