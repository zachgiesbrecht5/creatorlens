import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Team-wide queue: what everyone is scanning right now, and the house quota.
export default async function Queue() {
  const admin = supabaseAdmin();
  const day = new Date().toISOString().substring(0, 10);
  const [{ data: jobs }, { data: quota }, { data: tokens }] = await Promise.all([
    admin.from("scan_jobs").select("id,platform,handle,status,error,items_checked,rows_found,quota_units,created_at,finished_at,profiles(full_name)").order("created_at", { ascending: false }).limit(60),
    admin.from("house_quota").select("yt_units").eq("day", day).maybeSingle(),
    admin.from("ig_connections").select("ig_username,healthy,cooldown_until,calls_this_hour"),
  ]);
  const budget = Number(process.env.YT_DAILY_BUDGET || 9000);
  const used = quota?.yt_units ?? 0;
  return (
    <div>
      <h1 className="h2">Scan queue</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="label">YouTube house quota today</div>
          <div className="mt-2 text-3xl font-semibold">{used.toLocaleString()} <span className="text-base font-normal text-muted">/ {budget.toLocaleString()} units</span></div>
          <div className="mt-3 h-1.5 rounded bg-bg"><div className="h-1.5 rounded bg-fg" style={{ width: `${Math.min(100, (used / budget) * 100)}%` }} /></div>
          <p className="mt-2 font-mono text-[10px] text-dim">A channel scan costs roughly 25 units. Cached creators cost 0.</p>
        </div>
        <div className="card p-4">
          <div className="label">Instagram token pool</div>
          <ul className="mt-2 space-y-1 text-sm">
            {(tokens || []).map((t) => (
              <li key={t.ig_username} className="flex justify-between"><span>@{t.ig_username}</span><span className="font-mono text-[10px] text-muted">{t.cooldown_until && new Date(t.cooldown_until) > new Date() ? "cooling down" : t.healthy ? `${t.calls_this_hour} calls this hour` : "unhealthy"}</span></li>
            ))}
            {!tokens?.length && <li className="text-muted">No Instagram accounts connected. <Link className="underline hover:text-fg" href="/settings">Connect one.</Link></li>}
          </ul>
        </div>
      </div>
      <div className="card mt-6 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Creator</th><th>By</th><th>Status</th><th>Items</th><th>Rows</th><th>Units</th><th>When</th></tr>
          </thead>
          <tbody>
            {(jobs || []).map((j: any) => (
              <tr key={j.id}>
                <td><Link className="hover:underline" href={`/c/${j.platform}/${j.handle}`}>{j.platform === "youtube" ? "YT" : "IG"} @{j.handle}</Link></td>
                <td className="text-muted">{j.profiles?.full_name || ""}</td>
                <td><span className={j.status === "done" ? "pill-ok" : j.status === "failed" ? "pill-bad" : "pill-warn"}>{j.status}</span>{j.error && <span className="ml-2 font-mono text-[10px] text-dim" title={j.error}>{j.error.slice(0, 60)}</span>}</td>
                <td>{j.items_checked ?? ""}</td>
                <td>{j.rows_found ?? ""}</td>
                <td>{j.quota_units ?? ""}</td>
                <td className="font-mono text-[11px] text-muted">{new Date(j.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
