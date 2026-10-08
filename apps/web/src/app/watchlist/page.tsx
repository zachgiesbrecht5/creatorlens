import Link from "next/link";
import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { WatchButton } from "@/components/WatchButton";
import { MarkSeen } from "@/components/MarkSeen";
import { WatchFilter } from "@/components/WatchFilter";
import { WatchAdd } from "@/components/WatchAdd";
import { orgMemberIds } from "@/lib/org";

export const metadata = { title: "Watchlist | Sponsorprint" };
const fmt = (n: number | null) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export default async function Watchlist({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const sp = await searchParams; const filterFor = sp.for || "all";
  const profile = await currentProfile();
  if (!profile) redirect("/login?next=/watchlist");
  const admin = supabaseAdmin();
  const members = await orgMemberIds(profile);
  const [{ data: watchesRaw }, { data: events }] = await Promise.all([
    admin.from("watchlist").select("user_id,platform,handle,known_brands,added_at,last_checked_at,roster_creator_id").in("user_id", members).order("added_at", { ascending: false }),
    admin.from("watch_events").select("id,platform,handle,new_brands,seen,created_at,roster_creator_id").in("user_id", members).order("created_at", { ascending: false }).limit(80),
  ]);
  // roster chips shared across the org: one chip per creator handle, your own row preferred; any member's row maps to it
  const { data: rosterAll } = await admin.from("roster_creators").select("id,name,avatar_url,handle,user_id").in("user_id", members).order("name");
  const canon = new Map<string, any>(); const alias = new Map<string, string>();
  for (const r of rosterAll || []) { const k = String(r.handle || r.name).replace(/^@/, "").toLowerCase(); const cur = canon.get(k); if (!cur || (r.user_id === profile.id && cur.user_id !== profile.id)) canon.set(k, r); }
  for (const r of rosterAll || []) { const k = String(r.handle || r.name).replace(/^@/, "").toLowerCase(); alias.set(r.id, canon.get(k)!.id); }
  const rosterList = [...canon.values()];
  const norm = (rid: string | null) => (rid ? alias.get(rid) || rid : null);
  const matches = (rid: string | null) => filterFor === "all" || (filterFor === "none" ? !rid : norm(rid) === filterFor);
  // the same creator watched by two people is one row
  const seenKey = new Set<string>(); const watches = (watchesRaw || []).filter((w) => { const k = `${w.platform}:${String(w.handle).toLowerCase()}`; if (seenKey.has(k)) return false; seenKey.add(k); return true; }).map((w) => ({ ...w, roster_creator_id: norm(w.roster_creator_id) }));
  const allWatches = watches;
  const watchesShown = allWatches.filter((w) => matches(w.roster_creator_id));
  const eventsShown = (events || []).filter((e) => matches(e.roster_creator_id)).map((e) => ({ ...e, roster_creator_id: norm(e.roster_creator_id) }));
  const counts: Record<string, number> = { all: allWatches.length, none: allWatches.filter((w) => !w.roster_creator_id).length };
  for (const r of rosterList) counts[r.id] = allWatches.filter((w) => w.roster_creator_id === r.id).length;
  const handles = watchesShown.map((w) => w.handle);
  const { data: creators } = handles.length ? await admin.from("creators").select("platform,handle,display_name,avatar_url,followers,last_scanned_at").or(handles.map((h) => `handle.ilike.${h}`).join(",")) : { data: [] };
  const cr = (p: string, h: string) => (creators || []).find((c) => c.platform === p && c.handle.toLowerCase() === h.toLowerCase());
  const unseen = eventsShown.filter((e) => !e.seen);
  // what the creators themselves did in their portal: follows and unfollows in the last 30 days
  const { data: actsRaw } = await admin.from("events").select("id,name,props,created_at").in("user_id", members).in("name", ["creator_followed", "creator_unfollowed", "creator_muted", "creator_unmuted"]).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(40);
  const acts = (actsRaw || []).filter((a) => matches(norm((a.props as any)?.roster_creator_id)));
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="label mb-1.5">Watchlist</div>
          <h1 className="h2">Creators you're watching</h1>
          <p className="mt-1 text-sm text-muted">Each one is re-printed every week and any brand that shows up new is flagged here. Add a creator from the "watch" link on their print.</p>
        </div>
        {unseen.length > 0 && <MarkSeen />}
      </div>

      <div className="mb-4"><WatchAdd roster={rosterList.map((r) => ({ id: r.id, name: r.name }))} defaultFor={filterFor !== "all" && filterFor !== "none" ? filterFor : ""} /></div>
      <WatchFilter roster={rosterList.map((r) => ({ id: r.id, name: r.name, avatar: r.avatar_url }))} counts={counts} active={filterFor} />
      {acts.length > 0 && (
        <div className="card mb-6 p-4">
          <div className="label mb-2">From your creators</div>
          <ul className="space-y-1.5">{acts.map((a) => { const pr = a.props as any; return (
            <li key={a.id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span><b>{pr.creator}</b> {a.name === "creator_followed" ? "started following" : a.name === "creator_unfollowed" ? "unfollowed" : a.name === "creator_muted" ? "hid your pick" : "put back your pick"} <Link href={`/c/${pr.platform}/${pr.handle}`} className="font-medium hover:text-accent">{pr.name || `@${pr.handle}`}</Link>{a.name === "creator_followed" ? " in their lane" : a.name === "creator_muted" ? " from their lane (your watch is still on)" : ""}</span>
              <span className="num shrink-0 text-[10.5px] text-dim">{new Date(a.created_at).toLocaleDateString()}</span>
            </li>); })}</ul>
          <div className="mt-2 text-[11px] text-dim">Their follows feed the lane you both see. When they hide one of your picks it stays on your watchlist and just stops showing in their portal.</div>
        </div>
      )}
      {eventsShown.length > 0 && (
        <div className="card mb-8 divide-y divide-line">
          {eventsShown.map((e) => {
            const c = cr(e.platform, e.handle); const nb = e.new_brands as { brand: string; brand_id: string; deals: number }[];
            return (
              <div key={e.id} className={`flex items-start gap-3 p-4 ${e.seen ? "opacity-70" : ""}`}>
                {c?.avatar_url ? <img src={c.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-surface2" />}
                <div className="min-w-0 flex-1">
                  <div className="text-[14px]"><Link href={`/c/${e.platform}/${e.handle}`} className="font-medium hover:text-accent">{c?.display_name || `@${e.handle}`}</Link> <span className="text-muted">picked up {nb.length} new brand{nb.length === 1 ? "" : "s"}</span> <span className="num text-[10.5px] text-dim">· {new Date(e.created_at).toLocaleDateString()}</span></div>
                  <div className="mt-1 flex flex-wrap gap-1.5">{nb.map((b) => <Link key={b.brand_id} href={`/brands/${b.brand_id}`} className="pill hover:border-fg">{b.brand}</Link>)}</div>
                </div>
                {!e.seen && <span className="pill-ok">new</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="tbl"><thead><tr><th>Creator</th><th>For</th><th>Size</th><th className="text-right">Brands</th><th>Last print</th><th>Next</th><th></th></tr></thead>
          <tbody>
            {watchesShown.map((w) => { const c = cr(w.platform, w.handle); const forR = rosterList.find((r) => r.id === w.roster_creator_id); const last = c?.last_scanned_at ? new Date(c.last_scanned_at) : null; const next = last ? new Date(last.getTime() + 7 * 864e5) : null; return (
              <tr key={w.platform + w.handle}>
                <td><div className="flex items-center gap-3">{c?.avatar_url ? <img src={c.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-surface2" />}<div><Link href={`/c/${w.platform}/${w.handle}`} className="font-medium hover:text-accent">{c?.display_name || `@${w.handle}`}</Link><div className="num text-[10.5px] text-dim">@{w.handle} · {w.platform === "youtube" ? "YouTube" : "Instagram"}</div></div></div></td>
                <td className="text-[12px]">{forR ? forR.name : <span className="text-dim">general</span>}</td>
                <td className="num">{fmt(c?.followers ?? null)}</td>
                <td className="num text-right">{(w.known_brands as string[]).length}</td>
                <td className="num text-[12px] text-muted">{last ? last.toLocaleDateString() : "not yet"}</td>
                <td className="num text-[12px] text-muted">{next ? (next < new Date() ? "tonight" : next.toLocaleDateString()) : "tonight"}</td>
                <td className="num text-[11px]"><WatchButton platform={w.platform} handle={w.handle} initial roster={rosterList.map((r) => ({ id: r.id, name: r.name }))} initialFor={w.roster_creator_id || null} /></td>
              </tr>); })}
            {!watchesShown.length && <tr><td colSpan={7} className="py-8 text-center text-muted">{allWatches.length ? "Nothing filed under this creator yet. On any print, click watch and pick who it is for." : "Nothing watched yet. Open any print and click watch."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
