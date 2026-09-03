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
      <h1 className="text-2xl font-semibold">Scan queue</h1>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">YouTube house quota today</div>
          <div className="mt-1 text-2xl font-semibold">{used.toLocaleString()} <span className="text-base font-normal text-slate-500">/ {budget.toLocaleString()} units</span></div>
          <div className="mt-2 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand" style={{ width: `${Math.min(100, (used / budget) * 100)}%` }} /></div>
          <p className="mt-2 text-xs text-slate-500">A channel scan costs roughly 25 units. Cached creators cost 0.</p>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Instagram token pool</div>
          <ul className="mt-2 space-y-1 text-sm">
            {(tokens || []).map((t) => (
              <li key={t.ig_username} className="flex justify-between"><span>@{t.ig_username}</span><span className="text-xs text-slate-500">{t.cooldown_until && new Date(t.cooldown_until) > new Date() ? "cooling down" : t.healthy ? `${t.calls_this_hour} calls this hour` : "unhealthy"}</span></li>
            ))}
            {!tokens?.length && <li className="text-slate-500">No Instagram accounts connected. <Link className="text-brand underline" href="/settings">Connect one.</Link></li>}
          </ul>
        </div>
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-2">Creator</th><th className="px-4 py-2">By</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Items</th><th className="px-4 py-2">Rows</th><th className="px-4 py-2">Units</th><th className="px-4 py-2">When</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(jobs || []).map((j: any) => (
              <tr key={j.id}>
                <td className="px-4 py-2"><Link className="hover:text-brand" href={`/c/${j.platform}/${j.handle}`}>{j.platform === "youtube" ? "YT" : "IG"} @{j.handle}</Link></td>
                <td className="px-4 py-2 text-slate-500">{j.profiles?.full_name || ""}</td>
                <td className="px-4 py-2"><span className={`pill ${j.status === "done" ? "bg-emerald-50 text-emerald-700" : j.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{j.status}</span>{j.error && <span className="ml-2 text-xs text-slate-500" title={j.error}>{j.error.slice(0, 60)}</span>}</td>
                <td className="px-4 py-2">{j.items_checked ?? ""}</td>
                <td className="px-4 py-2">{j.rows_found ?? ""}</td>
                <td className="px-4 py-2">{j.quota_units ?? ""}</td>
                <td className="px-4 py-2 text-slate-500">{new Date(j.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
