import Link from "next/link";
import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { SignalsStrip, type MatchRow, type SignalRow } from "@/components/SignalsStrip";
import { LocationField } from "@/components/LocationField";

export const metadata = { title: "Signals | Sponsorprint" };

export default async function Signals() {
  const profile = await currentProfile();
  if (!profile) redirect("/login?next=/signals");
  const admin = supabaseAdmin();
  const [{ data: matches }, { data: general }, { data: roster }] = await Promise.all([
    admin.from("signal_matches").select("id,reason,score,seen,roster_creators(name),signals(*)").eq("user_id", profile.id).order("score", { ascending: false }).order("created_at", { ascending: false }).limit(40),
    admin.from("signals").select("*").order("announced_at", { ascending: false, nullsFirst: false }).limit(60),
    admin.from("roster_creators").select("id,name,handle,location,region").eq("user_id", profile.id).order("name"),
  ]);
  const ms: MatchRow[] = (matches || []).map((m: any) => ({ id: m.id, reason: m.reason, score: m.score, seen: m.seen, creator: m.roster_creators?.name || "creator", signal: m.signals }));
  const noLoc = (roster || []).filter((r) => !r.location);
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6"><div className="label mb-1.5">Signals</div><h1 className="h2">Sponsorship deals, matched to your roster</h1><p className="mt-1 text-sm text-muted">Every week the agent reads the wires and trade press for brands that signed a team, league, event or venue. A regional deal means the brand needs creators in that market within 4 to 8 weeks. Matches use each creator's location and lane.</p></div>
      {noLoc.length > 0 && (
        <div className="card mb-6 border-warn/40 p-4">
          <div className="mb-2 text-[13px]"><b>Add where your creators are based</b> so regional deals match. {noLoc.length} without a location:</div>
          <div className="grid gap-2 md:grid-cols-2">{noLoc.map((r) => <div key={r.id} className="flex items-center gap-2 text-[13px]"><span className="w-36 truncate font-medium">{r.name}</span><LocationField id={r.id} initial={r.location} /></div>)}</div>
        </div>
      )}
      <SignalsStrip matches={ms} general={[]} />
      {ms.length > 3 && <div className="mt-3 grid gap-3 md:grid-cols-3">{/* rest of matches */}</div>}
      <section className="mt-10">
        <div className="label mb-2">All recent signals</div>
        <div className="card overflow-x-auto">
          <table className="tbl"><thead><tr><th>Brand</th><th>Signed</th><th>Market</th><th>Category</th><th>When</th><th></th></tr></thead>
            <tbody>{(general || []).map((s: SignalRow) => <tr key={s.id}><td className="font-medium">{s.brand_id ? <Link href={`/brands/${s.brand_id}`} className="hover:text-accent">{s.brand}</Link> : s.brand}</td><td>{s.property}<span className="num ml-1 text-[10px] text-dim">{s.property_type}</span></td><td className="text-[12px] text-muted">{s.market}</td><td className="text-[12px] text-muted">{s.category}</td><td className="num text-[11px] text-muted">{s.announced_at ? new Date(s.announced_at).toLocaleDateString() : ""}</td><td className="num text-[10.5px]"><a href={s.url} target="_blank" rel="noreferrer" className="text-dim hover:text-accent">source ↗</a></td></tr>)}
            {!general?.length && <tr><td colSpan={6} className="py-8 text-center text-muted">The first run is Tuesday night. Nothing here yet.</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
