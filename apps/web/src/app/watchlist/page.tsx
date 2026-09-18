import Link from "next/link";
import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { WatchButton } from "@/components/WatchButton";
import { MarkSeen } from "@/components/MarkSeen";

export const metadata = { title: "Watchlist | Sponsorprint" };
const fmt = (n: number | null) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export default async function Watchlist() {
  const profile = await currentProfile();
  if (!profile) redirect("/login?next=/watchlist");
  const admin = supabaseAdmin();
  const [{ data: watches }, { data: events }] = await Promise.all([
    admin.from("watchlist").select("platform,handle,known_brands,added_at,last_checked_at").eq("user_id", profile.id).order("added_at", { ascending: false }),
    admin.from("watch_events").select("id,platform,handle,new_brands,seen,created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const handles = (watches || []).map((w) => w.handle);
  const { data: creators } = handles.length ? await admin.from("creators").select("platform,handle,display_name,avatar_url,followers,last_scanned_at").or(handles.map((h) => `handle.ilike.${h}`).join(",")) : { data: [] };
  const cr = (p: string, h: string) => (creators || []).find((c) => c.platform === p && c.handle.toLowerCase() === h.toLowerCase());
  const unseen = (events || []).filter((e) => !e.seen);
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

      {events && events.length > 0 && (
        <div className="card mb-8 divide-y divide-line">
          {events.map((e) => {
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
        <table className="tbl"><thead><tr><th>Creator</th><th>Size</th><th className="text-right">Brands</th><th>Last print</th><th>Next</th><th></th></tr></thead>
          <tbody>
            {(watches || []).map((w) => { const c = cr(w.platform, w.handle); const last = c?.last_scanned_at ? new Date(c.last_scanned_at) : null; const next = last ? new Date(last.getTime() + 7 * 864e5) : null; return (
              <tr key={w.platform + w.handle}>
                <td><div className="flex items-center gap-3">{c?.avatar_url ? <img src={c.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-surface2" />}<div><Link href={`/c/${w.platform}/${w.handle}`} className="font-medium hover:text-accent">{c?.display_name || `@${w.handle}`}</Link><div className="num text-[10.5px] text-dim">@{w.handle} · {w.platform === "youtube" ? "YouTube" : "Instagram"}</div></div></div></td>
                <td className="num">{fmt(c?.followers ?? null)}</td>
                <td className="num text-right">{(w.known_brands as string[]).length}</td>
                <td className="num text-[12px] text-muted">{last ? last.toLocaleDateString() : "not yet"}</td>
                <td className="num text-[12px] text-muted">{next ? (next < new Date() ? "tonight" : next.toLocaleDateString()) : "tonight"}</td>
                <td className="num text-[11px]"><WatchButton platform={w.platform} handle={w.handle} initial /></td>
              </tr>); })}
            {!watches?.length && <tr><td colSpan={6} className="py-8 text-center text-muted">Nothing watched yet. Open any print and click "watch".</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
