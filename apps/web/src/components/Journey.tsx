import Link from "next/link";
// The four steps a new manager walks, shown as a rail at the top of Start and
// Home until all four are done. Each step links to where it happens and the
// current one carries a one-line instruction.
export type JourneyState = { roster: boolean; neighborhood: boolean; pitched: boolean; searched: boolean };
export function Journey({ s, compact = false }: { s: JourneyState; compact?: boolean }) {
  const steps = [
    { k: "roster", done: s.roster, title: "Add your roster", tip: "Type the handle of a creator you represent.", href: "/start" },
    { k: "neighborhood", done: s.neighborhood, title: "Meet the neighborhood", tip: "Three creators in their lane, printed. Free plans get 5 of these a month. See who pays them.", href: "/start" },
    { k: "pitched", done: s.pitched, title: "Pitch a brand", tip: "Open a print, pick a brand, hit Pitch. The email lands in your Gmail drafts.", href: "/start" },
    { k: "searched", done: s.searched, title: "Print anyone", tip: "Search any creator from the home page. Your morning drop keeps three new ones coming each day.", href: "/" },
  ];
  const cur = steps.findIndex((x) => !x.done);
  if (cur === -1) return null;
  return (
    <div className={`jr ${compact ? "jr-compact" : ""}`}>
      {steps.map((st, i) => (
        <Link key={st.k} href={st.href} className={`jr-step ${st.done ? "jr-done" : i === cur ? "jr-cur" : "jr-todo"}`}>
          <span className="jr-n">{st.done ? "✓" : i + 1}</span>
          <span className="jr-body"><span className="jr-title">{st.title}</span>{i === cur && !compact && <span className="jr-tip">{st.tip}</span>}</span>
        </Link>
      ))}
    </div>
  );
}
