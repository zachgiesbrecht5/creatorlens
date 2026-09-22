import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin, currentProfile } from "@/lib/supabase";
import { CorrectionsTable, FeedbackList } from "@/components/ListenPanel";

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
  // Health + funnel
  const since = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
  const [{ data: hb }, { data: alerts }, { data: ev7 }, { data: ev30 }, { data: snaps }] = await Promise.all([
    admin.from("heartbeats").select("last_seen,detail").eq("source", "worker").maybeSingle(),
    admin.from("alerts").select("id,source,message,detail,created_at").eq("acked", false).order("created_at", { ascending: false }).limit(20),
    admin.from("events").select("name,user_id").gte("created_at", since(7)),
    admin.from("events").select("name,user_id").gte("created_at", since(30)),
    admin.from("snapshots").select("day,counts").order("day", { ascending: false }).limit(2),
  ]);
  // Listening: traffic, feedback, flags
  const [{ data: pv }, { data: fb }, { data: cr }] = await Promise.all([
    admin.from("pageviews").select("anon_id,user_id,path,referrer,created_at").gte("created_at", since(30)).order("created_at", { ascending: false }).limit(20000),
    admin.from("feedback").select("id,email,path,mood,kind,body,created_at").order("created_at", { ascending: false }).limit(40),
    admin.from("corrections").select("id,scope,note,created_at,user_id,brands(name),creators(handle)").eq("status", "open").order("created_at", { ascending: false }).limit(50),
  ]);
  const pvRows = pv || [];
  const pv7 = pvRows.filter((r) => r.created_at >= since(7));
  const visitors = (rows: typeof pvRows) => new Set(rows.map((r) => r.anon_id)).size;
  const tally = (vals: (string | null)[]) => Object.entries(vals.reduce((m: Record<string, number>, v) => { if (v) m[v] = (m[v] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topPaths = tally(pv7.map((r) => (r.path.startsWith("/p/") ? "/p/* (public prints)" : r.path.startsWith("/c/") ? "/c/* (prints)" : r.path.startsWith("/brands/") ? "/brands/*" : r.path)));
  const topRefs = tally(pv7.map((r) => r.referrer));
  const byAnon = new Map<string, { days: Set<string>; user: boolean }>();
  for (const r of pvRows) { const e = byAnon.get(r.anon_id) || { days: new Set(), user: false }; e.days.add(r.created_at.slice(0, 10)); if (r.user_id) e.user = true; byAnon.set(r.anon_id, e); }
  const anonTotal = byAnon.size, signedUp = [...byAnon.values()].filter((e) => e.user).length, returning = [...byAnon.values()].filter((e) => e.days.size >= 2).length;
  const whoAll = new Map((outsiders || []).map((p) => [p.id, p.full_name || p.email]));
  const crRows = (cr || []).map((c: any) => ({ id: c.id, scope: c.scope, note: c.note, created_at: c.created_at, brand: c.brands?.name || "?", creator: c.creators?.handle || "?", by: whoAll.get(c.user_id) || "someone" }));
  const workerAge = hb?.last_seen ? (Date.now() - new Date(hb.last_seen).getTime()) / 60000 : null;
  const funnel = (rows: { name: string; user_id: string | null }[] | null) => {
    const by: Record<string, Set<string>> = {};
    for (const r of rows || []) { (by[r.name] ||= new Set()).add(r.user_id || "anon"); }
    const u = (n: string) => by[n]?.size || 0;
    return { signup: u("signup"), print: u("print") + u("print_cached"), reveal: u("reveal"), draft: u("draft"), locked: u("reveal_locked") + u("draft_locked") + u("print_locked"), checkout: u("checkout_started"), upgraded: u("upgraded") };
  };
  const f7 = funnel(ev7), f30 = funnel(ev30);
  const budget = Number(process.env.YT_DAILY_BUDGET || 9000);
  const used = quota?.yt_units ?? 0;
  return (
    <div>

      {/* Health */}
      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <div className={`card p-4 ${workerAge == null || workerAge > 10 ? "border-bad/40" : ""}`}>
          <div className="label">worker</div>
          <div className="mt-1 text-lg font-semibold">{workerAge == null ? "never seen" : workerAge < 2 ? "alive" : `${Math.round(workerAge)} min ago`}</div>
          {(workerAge == null || workerAge > 10) && <div className="text-[11px] text-bad">no heartbeat; check Railway</div>}
        </div>
        <div className={`card p-4 ${alerts?.length ? "border-warn/40" : ""}`}>
          <div className="label">alerts</div>
          <div className="mt-1 text-lg font-semibold">{alerts?.length || 0}</div>
          <div className="text-[11px] text-muted">{alerts?.[0] ? `${alerts[0].source}: ${alerts[0].message}` : "nothing broken"}</div>
        </div>
        <div className="card p-4">
          <div className="label">last snapshot</div>
          <div className="mt-1 text-lg font-semibold">{snaps?.[0]?.day || "none yet"}</div>
          <div className="num text-[11px] text-muted">{snaps?.[0] ? Object.entries(snaps[0].counts as Record<string, number>).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(" · ") : "runs nightly after 08:00 UTC"}</div>
        </div>
        <div className="card p-4">
          <div className="label">funnel · 7d / 30d (people)</div>
          <div className="num mt-1 grid grid-cols-2 gap-x-3 text-[11px] leading-5">
            <span>signups <b>{f7.signup}</b> / {f30.signup}</span><span>printed <b>{f7.print}</b> / {f30.print}</span>
            <span>revealed <b>{f7.reveal}</b> / {f30.reveal}</span><span>drafted <b>{f7.draft}</b> / {f30.draft}</span>
            <span>hit a wall <b>{f7.locked}</b> / {f30.locked}</span><span>checkout <b>{f7.checkout}</b> / {f30.checkout}</span>
            <span>upgraded <b className="text-ok">{f7.upgraded}</b> / {f30.upgraded}</span>
          </div>
        </div>
      </div>
      {alerts && alerts.length > 0 && (
        <div className="card mb-6 overflow-x-auto">
          <table className="tbl"><thead><tr><th>When</th><th>Source</th><th>What</th><th>Detail</th></tr></thead>
            <tbody>{alerts.map((a) => <tr key={a.id}><td className="num text-[11px] text-muted">{new Date(a.created_at).toLocaleString()}</td><td>{a.source}</td><td className="font-medium">{a.message}</td><td className="num max-w-md truncate text-[11px] text-muted" title={JSON.stringify(a.detail)}>{JSON.stringify(a.detail)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
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

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <div className="label">listening · visitors (not you)</div>
          <div className="mt-3 grid grid-cols-4 gap-3 text-center">
            {[["7d visitors", visitors(pv7)], ["30d visitors", anonTotal], ["signed in", signedUp], ["came back", returning]].map(([l, n]) => (
              <div key={String(l)} className="rounded-lg bg-surface2 p-3"><div className="num text-xl font-semibold">{n as number}</div><div className="label">{l}</div></div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-6 text-[12px]">
            <div><div className="label mb-2">top pages · 7d</div>{topPaths.map(([k, n]) => <div key={k} className="flex justify-between py-0.5"><span className="truncate text-muted">{k}</span><span className="num">{n}</span></div>)}{!topPaths.length && <p className="text-dim">No traffic yet.</p>}</div>
            <div><div className="label mb-2">sent from · 7d</div>{topRefs.map(([k, n]) => <div key={k} className="flex justify-between py-0.5"><span className="truncate text-muted">{k}</span><span className="num">{n}</span></div>)}{!topRefs.length && <p className="text-dim">Direct only so far.</p>}</div>
          </div>
        </div>
        <div className="card p-6">
          <div className="label mb-2">feedback and questions</div>
          <FeedbackList rows={(fb || []) as any} />
        </div>
      </div>
      <div className="card mt-6 p-6">
        <div className="label mb-2">flagged deals to review · outsiders can&apos;t edit the index, you apply</div>
        <CorrectionsTable rows={crRows} />
      </div>
    </div>
  );
}
