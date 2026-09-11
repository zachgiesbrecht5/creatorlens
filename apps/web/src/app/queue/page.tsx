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
  // Outside intel: what managers who aren't in the house are scanning and pitching.
  const { data: houseOrgs } = await admin.from("orgs").select("id").eq("is_house", true);
  const houseIds = (houseOrgs || []).map((o) => o.id);
  const { data: outsiders } = await admin.from("profiles").select("id,full_name,email,org_id,plan").neq("plan", "admin");
  const outsideIds = (outsiders || []).filter((p) => !p.org_id || !houseIds.includes(p.org_id)).map((p) => p.id);
  const who = new Map((outsiders || []).map((p) => [p.id, p.full_name || p.email]));
  const [{ data: outsideScans }, { data: outsidePitches }] = outsideIds.length ? await Promise.all([
    admin.from("creator_access").select("user_id,platform,handle,created_at").in("user_id", outsideIds).order("created_at", { ascending: false }).limit(40),
    admin.from("outreach_log").select("user_id,creator_handle,contact_email,subject,status,created_at,brands(name,category)").in("user_id", outsideIds).order("created_at", { ascending: false }).limit(40),
  ]) : [{ data: [] }, { data: [] }];
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

      <div className="mt-10 mb-3 flex items-baseline justify-between">
        <div><div className="label mb-1">Outside the house</div><h2 className="h2 text-xl">What other managers are doing</h2></div>
        <div className="font-mono text-[11px] text-dim">{outsideIds.length} outside account{outsideIds.length === 1 ? "" : "s"}</div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="border-b border-line px-4 py-3 text-sm font-medium">Creators they unlocked</div>
          <table className="tbl">
            <thead><tr><th>Creator</th><th>By</th><th>When</th></tr></thead>
            <tbody>
              {(outsideScans || []).map((a) => (
                <tr key={a.user_id + a.platform + a.handle}>
                  <td><Link href={`/c/${a.platform}/${a.handle}`} className="hover:text-accent">@{a.handle}</Link> <span className="num text-[10px] text-dim">{a.platform === "youtube" ? "YT" : "IG"}</span></td>
                  <td className="text-muted">{who.get(a.user_id)}</td>
                  <td className="num text-[11px] text-muted">{new Date(a.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {!outsideScans?.length && <tr><td colSpan={3} className="py-6 text-center text-sm text-muted">Nothing yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card overflow-x-auto">
          <div className="border-b border-line px-4 py-3 text-sm font-medium">Brands they pitched</div>
          <table className="tbl">
            <thead><tr><th>Brand</th><th>For</th><th>By</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {(outsidePitches || []).map((o: any, i) => (
                <tr key={i}>
                  <td className="font-medium">{o.brands?.name || "?"}{o.brands?.category && <span className="pill ml-2">{o.brands.category}</span>}</td>
                  <td className="text-muted">{o.creator_handle ? "@" + o.creator_handle : ""}</td>
                  <td className="text-muted">{who.get(o.user_id)}</td>
                  <td className="num text-[11px]">{o.status}</td>
                  <td className="num text-[11px] text-muted">{new Date(o.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {!outsidePitches?.length && <tr><td colSpan={5} className="py-6 text-center text-sm text-muted">Nothing yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
