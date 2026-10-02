import Link from "next/link";
// Filter chips: all / each roster creator / general
export function WatchFilter({ roster, counts, active }: { roster: { id: string; name: string; avatar: string | null }[]; counts: Record<string, number>; active: string }) {
  const chip = (key: string, label: string, avatar?: string | null) => (
    <Link key={key} href={key === "all" ? "/watchlist" : `/watchlist?for=${key}`} className={`wf-chip ${active === key ? "wf-on" : ""}`}>
      {avatar ? <img src={avatar} alt="" /> : null}<span>{label}</span><em>{counts[key] ?? 0}</em>
    </Link>
  );
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {chip("all", "All")}
      {roster.map((r) => chip(r.id, r.name, r.avatar))}
      {chip("none", "General")}
    </div>
  );
}
