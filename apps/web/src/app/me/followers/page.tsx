import Link from "next/link";
import { requireCreator } from "@/lib/creator-portal";
import { Spark } from "@/components/Spark";
import { myCreator, history, at, fmtK, pct, signed, dShort } from "@/lib/me-stats";
import { laneDigest } from "@/lib/lane-digest";
import { fitBand } from "@/lib/lane-brief";

// Followers tile -> page. The line is the creator's own count at every print; the lane's median 30-day
// growth sits beside it so "+1.2%" has something to be measured against.
export default async function MyFollowers() {
  const { roster: r, preview } = await requireCreator();
  const platform = r.platform === "youtube" ? "youtube" : "instagram";
  const me = await myCreator(platform, r.handle || "");
  const rows = me ? await history(me.id, 90) : [];
  const now = me?.followers || r.followers || null;
  const g7 = pct(now, at(rows, 7)?.followers), g30 = pct(now, at(rows, 30)?.followers), g90 = pct(now, at(rows, 90)?.followers ?? rows[0]?.followers);
  const digest = await laneDigest(r.user_id, r.id, 30, { fit: fitBand(now) });
  const laneG = digest.creators.map((c) => c.growth30).filter((g): g is number => g != null).sort((a, b) => a - b);
  const laneMedian = laneG.length ? laneG[Math.floor(laneG.length / 2)] * 100 : null;
  const faster = digest.creators.filter((c) => c.growth30 != null && c.growth30 * 100 > (g30 ?? -Infinity)).sort((a, b) => (b.growth30 || 0) - (a.growth30 || 0)).slice(0, 5);
  const series = rows.filter((x) => x.followers).map((x) => Number(x.followers));
  const label = platform === "youtube" ? "subscribers" : "followers";
  return (
    <div className="mx-auto max-w-5xl">
      {preview && <div className="mb-4 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-[12.5px]"><span>Previewing as <b>{r.name}</b>.</span><a href="/api/portal/preview?clear=1" className="num text-[11px] text-accent hover:underline">end preview</a></div>}
      <div className="mb-5 flex items-end justify-between gap-4"><div><div className="label mb-1"><Link href="/me" className="hover:text-accent">Home</Link> · {label}</div><h1 className="h1">{fmtK(now)} {label}</h1><p className="mt-1 text-[14px] text-muted">Counted at every weekly print. Growth compares today with the print closest to each point back.</p></div></div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[["7 days", g7], ["30 days", g30], ["90 days", g90]].map(([k, v]) => (
          <div key={String(k)} className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">{k}</div><div className={`mt-1 text-[22px] font-bold ${v == null ? "text-dim" : (v as number) >= 0 ? "text-ok" : "text-bad"}`}>{signed(v as number | null) || "soon"}</div>{v == null && <div className="num text-[10.5px] text-dim">needs a print that far back</div>}</div>
        ))}
        <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Lane median · 30 days</div><div className={`mt-1 text-[22px] font-bold ${laneMedian == null ? "text-dim" : "text-fg"}`}>{laneMedian == null ? "soon" : signed(laneMedian)}</div><div className="num text-[10.5px] text-dim">{laneG.length} lane creators with two prints · {g30 != null && laneMedian != null ? (g30 >= laneMedian ? "you're ahead" : "you're behind") : ""}</div></div>
      </div>
      <div className="card mt-4 p-5">
        <div className="label mb-2">Last 90 days</div>
        <Spark values={series} labels={[dShort(rows.find((x) => x.followers)?.captured_at), dShort(rows.filter((x) => x.followers).at(-1)?.captured_at)]} format={fmtK} />
        <div className="num mt-2 text-[10.5px] text-dim">{rows.length} print{rows.length === 1 ? "" : "s"} in the window. The count is read from the public profile at print time; day-to-day noise is normal, the slope is the signal.</div>
      </div>
      {faster.length > 0 && (
        <div className="card mt-4 p-5">
          <div className="label mb-1">Growing faster than you right now</div>
          <p className="mb-3 text-[13px] text-muted">Lane creators near your size whose 30-day growth beats yours. Their best posts are on <Link href="/me/watchlist" className="text-accent hover:underline">your lane</Link>.</p>
          <ul className="divide-y divide-line">{faster.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">{c.avatar ? <img src={c.avatar} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="inline-block h-6 w-6 rounded-full bg-surface2" />}<Link href={`/c/${c.platform}/${c.handle}`} className="truncate font-medium hover:text-accent">{c.name}</Link><span className="num text-[10.5px] text-muted">{fmtK(c.followers)}</span></span>
              <span className="num text-ok">{signed((c.growth30 || 0) * 100)}</span>
            </li>))}</ul>
        </div>
      )}
    </div>
  );
}
