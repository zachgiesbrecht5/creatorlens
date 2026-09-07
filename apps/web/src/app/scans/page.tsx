import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin, currentProfile } from "@/lib/supabase";
import { fmt } from "@/lib/fmt";

export const dynamic = "force-dynamic";

// The user's own scan history: what they looked up, when, what it found.
// Results live in the shared pool; this is just their way back to them.
export default async function MyScans() {
  const me = await currentProfile();
  if (!me) redirect("/login?next=/scans");
  const admin = supabaseAdmin();
  const { data: jobs } = await admin.from("scan_jobs")
    .select("id,platform,handle,status,error,rows_found,created_at,finished_at,creators(handle,display_name,avatar_url,followers,category)")
    .eq("user_id", me.id).order("created_at", { ascending: false }).limit(100);


  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-1.5">History</div>
          <h1 className="h2">My scans</h1>
          <p className="mt-1 text-sm text-muted">Every creator you have looked up. Results stay in the shared index, so reopening one is free.</p>
        </div>
        <Link href="/" className="btn-primary">New scan</Link>
      </div>

      {!jobs?.length ? (
        <div className="card mt-6 p-10 text-center text-sm text-muted">No scans yet. <Link href="/" className="text-accent hover:underline">Run your first one.</Link></div>
      ) : (
        <div className="card mt-6 overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Creator</th><th>Vertical</th><th className="text-right">Brands found</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {(jobs || []).map((j: any) => {
                const c = j.creators;
                const live = j.status === "queued" || j.status === "running" || j.status === "rate_limited";
                return (
                  <tr key={j.id}>
                    <td>
                      <Link href={`/c/${j.platform}/${c?.handle || j.handle}`} className="flex items-center gap-3 hover:text-accent">
                        {c?.avatar_url ? <img src={c.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <div className="h-7 w-7 rounded-full bg-surface2" />}
                        <span className="font-medium">{c?.display_name || "@" + j.handle}</span>
                        <span className="num text-[10px] text-dim">{j.platform === "youtube" ? "YT" : "IG"}{c?.followers ? ` · ${fmt(c.followers)}` : ""}</span>
                      </Link>
                    </td>
                    <td>{c?.category && c.category !== "Other" ? <span className="pill">{c.category}</span> : <span className="num text-[10px] text-dim">–</span>}</td>
                    <td className="num text-right">{j.status === "done" ? j.rows_found ?? 0 : ""}</td>
                    <td>
                      {j.status === "done" ? <span className="pill-ok">done</span> : j.status === "failed" ? <span className="pill-bad" title={j.error || ""}>failed · refunded</span> : <span className="pill-warn">{live ? "scanning" : j.status}</span>}
                    </td>
                    <td className="num text-[11px] text-muted">{new Date(j.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
