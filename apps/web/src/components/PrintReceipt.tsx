// The hero: a sponsor print coming out of the machine, one line at a time.
// Pure CSS animation (see .rc-* in globals.css); honours prefers-reduced-motion.
// Everything on it is fictional: the point is the shape of the thing you get.

const LINES: { brand: string; tag: string; when: string; deals: number; repeat?: boolean }[] = [
  { brand: "Hearthline", tag: "#hearthlinepartner", when: "Aug 2026", deals: 3, repeat: true },
  { brand: "Fieldnote Coffee", tag: "@fieldnote.coffee", when: "Jul 2026", deals: 1 },
  { brand: "Loom & Ladle", tag: "#loomandladle #ad", when: "Jun 2026", deals: 2, repeat: true },
  { brand: "Northbay Knives", tag: "paid partnership", when: "May 2026", deals: 1 },
  { brand: "Brightstem", tag: "#brightstemambassador", when: "Mar 2026", deals: 1 },
  { brand: "Saltmarsh Pantry", tag: "@saltmarsh.pantry", when: "Jan 2026", deals: 1 },
];

export function PrintReceipt({ indexDeals }: { indexDeals: number }) {
  const step = (_ms: number) => ({});   // lines ride the paper feed now; per-line delays unused
  const totalDeals = LINES.reduce((s, l) => s + l.deals, 0);
  const repeats = LINES.filter((l) => l.repeat).length;

  return (
    <div className="rc-wrap" aria-hidden>
      <div className="rc-slot"><span className="rc-led" /></div>
      <div className="rc-feed">
      <div className="rc-paper">
        <div className="rc-line rc-head" style={step(250)}>
          <span>sponsorprint</span>
          <span>print #48213</span>
        </div>
        <div className="rc-line rc-title" style={step(220)}>
          <span className="rc-handle">@priyacooks</span>
          <span className="rc-sub">Instagram · 312K · scanned just now</span>
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
