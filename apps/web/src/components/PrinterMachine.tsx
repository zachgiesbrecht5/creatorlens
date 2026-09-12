"use client";
import { useEffect, useState } from "react";

// The thermal receipt printer, reusable. `lcd` is what the display reads;
// pass `lines` instead to have it typed out like a typewriter and cycled.
export function PrinterMachine({ lcd, lines, printing, onFeed, className }: { lcd?: string; lines?: string[]; printing?: boolean; onFeed?: () => void; className?: string }) {
  const typed = useTypewriter(lines);
  const text = lines ? typed : lcd || "";
  return (
    <svg className={`rc-machine ${className || ""}`} viewBox="0 0 440 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={onFeed ? "Receipt printer. Press FEED to print again." : "Receipt printer"}>
      <defs>
        <linearGradient id="rcBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a404c" /><stop offset=".55" stopColor="#1c2029" /><stop offset="1" stopColor="#0b0d12" /></linearGradient>
        <linearGradient id="rcLid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a505d" /><stop offset="1" stopColor="#262b35" /></linearGradient>
        <linearGradient id="rcSlot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" /><stop offset="1" stopColor="#1a1e26" /></linearGradient>
      </defs>
      <ellipse cx="220" cy="118" rx="200" ry="6" fill="rgba(11,13,18,.28)" />
      <rect x="8" y="30" width="424" height="82" rx="14" fill="url(#rcBody)" />
      <rect x="8" y="30" width="424" height="82" rx="14" fill="none" stroke="rgba(255,255,255,.08)" />
      <rect x="26" y="8" width="388" height="40" rx="12" fill="url(#rcLid)" />
      <rect x="26" y="8" width="388" height="40" rx="12" fill="none" stroke="rgba(255,255,255,.12)" />
      <line x1="60" y1="22" x2="380" y2="22" stroke="rgba(255,255,255,.08)" />
      <text x="220" y="40" textAnchor="middle" fontFamily="var(--font-sans), Inter, sans-serif" fontSize="9" letterSpacing="2.5" fill="rgba(255,255,255,.35)">SPONSORPRINT</text>
      <rect x="26" y="62" width="300" height="30" rx="5" fill="#0a1a12" stroke="rgba(43,208,124,.25)" />
      <text x="38" y="82" fontFamily="var(--font-mono), monospace" fontSize="12" fill="#2bd07c" letterSpacing="1">{text}{lines && <tspan className="rc-cursor">▌</tspan>}</text>
      <g className={onFeed ? "rc-feedbtn" : ""} onClick={onFeed} role={onFeed ? "button" : undefined} tabIndex={onFeed ? 0 : undefined} onKeyDown={(e) => { if (onFeed && (e.key === "Enter" || e.key === " ")) onFeed(); }}>
        {onFeed && <title>Print again, with sound</title>}
        <circle cx="386" cy="77" r="13" fill="#161a22" stroke="rgba(255,255,255,.12)" />
        <text x="386" y="80.5" textAnchor="middle" fontFamily="var(--font-mono), monospace" fontSize="7" fill="rgba(255,255,255,.55)" letterSpacing="1" pointerEvents="none">FEED</text>
      </g>
      <circle className={printing ? "rc-led rc-led-busy" : "rc-led rc-led-idle"} cx="414" cy="77" r="4" />
      <rect x="24" y="100" width="392" height="9" rx="3" fill="url(#rcSlot)" />
      <rect x="24" y="100" width="392" height="9" rx="3" fill="none" stroke="rgba(255,255,255,.06)" />
    </svg>
  );
}

function useTypewriter(lines?: string[]) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!lines?.length) return;
    let li = 0, ci = 0, dir = 1, t: any;
    const tick = () => {
      const line = lines[li % lines.length];
      if (dir === 1) {
        ci++; setOut(line.slice(0, ci));
        if (ci >= line.length) { dir = -1; t = setTimeout(tick, 1400); return; }
        t = setTimeout(tick, 38 + Math.random() * 40);
      } else {
        ci = Math.max(0, ci - 2); setOut(line.slice(0, ci));
        if (ci === 0) { dir = 1; li++; t = setTimeout(tick, 250); return; }
        t = setTimeout(tick, 18);
      }
    };
    t = setTimeout(tick, 200);
    return () => clearTimeout(t);
  }, [lines?.join("|")]);
  return out;
}
