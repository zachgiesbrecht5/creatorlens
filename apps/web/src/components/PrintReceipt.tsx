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

export function PrintReceipt({ indexDeals }: { indexDeals: number }) {
  const step = (_ms: number) => ({});   // lines ride the paper feed now; per-line delays unused
  const totalDeals = LINES.reduce((s, l) => s + l.deals, 0);
  const repeats = LINES.filter((l) => l.repeat).length;

  return (
    <div className="rc-wrap" aria-hidden>
      {/* The machine. A thermal receipt printer: lid, LCD that reads PRINTING then DONE, feed button, LED, and the slot the paper comes out of. */}
      <svg className="rc-machine" viewBox="0 0 440 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Receipt printer">
        <defs>
          <linearGradient id="rcBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a404c" /><stop offset=".55" stopColor="#1c2029" /><stop offset="1" stopColor="#0b0d12" /></linearGradient>
          <linearGradient id="rcLid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a505d" /><stop offset="1" stopColor="#262b35" /></linearGradient>
          <linearGradient id="rcSlot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" /><stop offset="1" stopColor="#1a1e26" /></linearGradient>
        </defs>
        {/* shadow under the machine */}
        <ellipse cx="220" cy="118" rx="200" ry="6" fill="rgba(11,13,18,.28)" />
        {/* body */}
        <rect x="8" y="30" width="424" height="82" rx="14" fill="url(#rcBody)" />
        <rect x="8" y="30" width="424" height="82" rx="14" fill="none" stroke="rgba(255,255,255,.08)" />
        {/* paper-roll lid */}
        <rect x="26" y="8" width="388" height="40" rx="12" fill="url(#rcLid)" />
        <rect x="26" y="8" width="388" height="40" rx="12" fill="none" stroke="rgba(255,255,255,.12)" />
        <line x1="60" y1="22" x2="380" y2="22" stroke="rgba(255,255,255,.08)" />
        <text x="220" y="40" textAnchor="middle" fontFamily="var(--font-sans), Inter, sans-serif" fontSize="9" letterSpacing="2.5" fill="rgba(255,255,255,.35)">SPONSORPRINT</text>
        {/* LCD */}
        <rect x="26" y="62" width="128" height="30" rx="5" fill="#0a1a12" stroke="rgba(43,208,124,.25)" />
        <text className="rc-lcd rc-lcd-printing" x="38" y="82" fontFamily="var(--font-mono), monospace" fontSize="12" fill="#2bd07c" letterSpacing="1">PRINTING…</text>
        <text className="rc-lcd rc-lcd-done" x="38" y="82" fontFamily="var(--font-mono), monospace" fontSize="12" fill="#2bd07c" letterSpacing="1">DONE ✓ TEAR</text>
        {/* feed button + LED */}
        <circle cx="386" cy="77" r="13" fill="#161a22" stroke="rgba(255,255,255,.12)" />
        <text x="386" y="80.5" textAnchor="middle" fontFamily="var(--font-mono), monospace" fontSize="7" fill="rgba(255,255,255,.55)" letterSpacing="1">FEED</text>
        <circle className="rc-led" cx="414" cy="77" r="4" />
        {/* slot: this is where the paper comes out */}
        <rect x="24" y="100" width="392" height="9" rx="3" fill="url(#rcSlot)" />
        <rect x="24" y="100" width="392" height="9" rx="3" fill="none" stroke="rgba(255,255,255,.06)" />
      </svg>
      <div className="rc-feed">
      <div className="rc-paper">
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
