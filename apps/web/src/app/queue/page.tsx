import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin, currentProfile } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Remove a queue entry. Scan results stay in the shared pool; only the job
// row goes. Own jobs, or any job for admins.
async function removeJob(formData: FormData) {
  "use server";
  const profile = await currentProfile();
  if (!profile) return;
  const id = String(formData.get("id"));
  const admin = supabaseAdmin();
  const q = admin.from("scan_jobs").delete().eq("id", id).in("status", ["done", "failed", "rate_limited", "queued"]);
  await (profile.plan === "admin" ? q : q.eq("user_id", profile.id));
  redirect("/queue");
}

// Team-wide queue: what everyone is scanning right now, and the house quota.
export default async function Queue() {
  const admin = supabaseAdmin();
  const me = await currentProfile();
  if (!me) redirect("/login?next=/queue");
  if (me.plan !== "admin") redirect("/scans");
  const day = new Date().toISOString().substring(0, 10);
  const [{ data: jobs }, { data: quota }, { data: tokens }] = await Promise.all([
    admin.from("scan_jobs").select("id,user_id,platform,handle,status,error,items_checked,rows_found,quota_units,created_at,finished_at,profiles(full_name)").order("created_at", { ascending: false }).limit(60),
    admin.from("house_quota").select("yt_units").eq("day", day).maybeSingle(),
    admin.from("ig_connections").select("ig_username,healthy,cooldown_until,calls_this_hour"),
  ]);
  const budget = Number(process.env.YT_DAILY_BUDGET || 9000);
  const used = quota?.yt_units ?? 0;
  return (
    <div>
      <div className="label mb-1.5">Team</div>
      <h1 className="h2">Scan queue</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="label">YouTube house quota today</div>
          <div className="num mt-2 text-3xl font-semibold">{used.toLocaleString()} <span className="text-base font-normal text-muted">/ {budget.toLocaleString()} units</span></div>
          <div className="mt-3 h-1.5 rounded bg-line"><div className="h-1.5 rounded bg-accent" style={{ width: `${Math.min(100, (used / budget) * 100)}%` }} /></div>
          <p className="mt-2 font-mono text-[10px] text-dim">A channel scan costs roughly 25 units. Cached creators cost 0.</p>
        </div>
        <div className="card p-4">
          <div className="label">Instagram token pool</div>
          <ul className="mt-2 space-y-1 text-sm">
            {(tokens || []).map((t) => (
              <li key={t.ig_username} className="flex justify-between"><span>@{t.ig_username}</span><span className="num text-[10px] text-muted">{t.cooldown_until && new Date(t.cooldown_until) > new Date() ? "cooling down" : t.healthy ? `${t.calls_this_hour} calls this hour` : "unhealthy"}</span></li>
            ))}
            {!tokens?.length && <li className="text-muted">No Instagram accounts connected. <Link className="text-accent hover:underline" href="/settings">Connect one.</Link></li>}
          </ul>
        </div>
      </div>
      <div className="card mt-6 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Creator</th><th>By</th><th>Status</th><th>Items</th><th>Rows</th><th>Units</th><th>When</th><th></th></tr>
          </thead>
          <tbody>
            {(jobs || []).map((j: any) => (
              <tr key={j.id}>
                <td><Link className="font-medium hover:text-accent" href={`/c/${j.platform}/${j.handle}`}>{j.platform === "youtube" ? "YT" : "IG"} @{j.handle}</Link></td>
                <td className="text-muted">{j.profiles?.full_name || ""}</td>
                <td><span className={j.status === "done" ? "pill-ok" : j.status === "failed" ? "pill-bad" : "pill-warn"}>{j.status}</span>{j.error && <span className="ml-2 font-mono text-[10px] text-dim" title={j.error}>{j.error.slice(0, 60)}</span>}</td>
                <td className="num">{j.items_checked ?? ""}</td>
                <td className="num">{j.rows_found ?? ""}</td>
                <td className="num">{j.quota_units ?? ""}</td>
                <td className="num text-[11px] text-muted">{new Date(j.created_at).toLocaleString()}</td>
                <td>{me && j.status !== "running" && (me.plan === "admin" || j.user_id === me.id) && (
                  <form action={removeJob}><input type="hidden" name="id" value={j.id} /><button className="font-mono text-[10px] text-dim hover:text-bad" title="Remove from the queue (results stay in the pool)">remove</button></form>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
