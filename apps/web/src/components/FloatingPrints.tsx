import Link from "next/link";
import type { Sample } from "@/components/PrintReceipt";

// Real prints drifting behind the hero like paper in slow air. Positioned in
// the gutters so they never sit under the headline or the live receipt; faded,
// slightly rotated, each on its own drift timing. Click one to open it.
const SLOTS = [
  { left: "-2%", top: "4%", rot: -7, dur: 26, delay: 0, w: 300 },
  { left: "22%", top: "70%", rot: 4, dur: 31, delay: -9, w: 260 },
  { left: "44%", top: "-6%", rot: 6, dur: 24, delay: -4, w: 280 },
  { left: "86%", top: "58%", rot: -5, dur: 29, delay: -14, w: 270 },
  { left: "63%", top: "78%", rot: 8, dur: 33, delay: -20, w: 240 },
  { left: "-4%", top: "60%", rot: 3, dur: 28, delay: -17, w: 250 },
];

export function FloatingPrints({ samples }: { samples: Sample[] }) {
  if (!samples.length) return null;
  return (
    <div className="fp" aria-hidden>
      {SLOTS.map((sl, i) => {
        const p = samples[i % samples.length];
        return (
          <Link key={i} href={p.href} className="fp-print" style={{ left: sl.left, top: sl.top, width: sl.w, ["--rot" as any]: `${sl.rot}deg`, ["--dur" as any]: `${sl.dur}s`, ["--delay" as any]: `${sl.delay}s` }}>
            <div className="fp-head"><span>sponsorprint</span><span>{p.platform} · {p.followers}</span></div>
            <div className="fp-handle">@{p.handle}</div>
            {p.lines.slice(0, 5).map((l) => (
              <div key={l.brand} className="fp-row"><span className="fp-brand">{l.brand}</span><span className="fp-when">{l.when}</span><span className="fp-deals">{l.deals}</span></div>
            ))}
            <div className="fp-foot">{p.lines.length} brands · public posts only</div>
            <div className="fp-tear" />
          </Link>
        );
      })}
    </div>
  );
}
