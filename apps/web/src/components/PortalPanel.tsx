"use client";
import { useState } from "react";
import { Experiments } from "@/components/Experiments";
import { Requests } from "@/components/Requests";

// Manager side of the creator portal, on the roster creator's page: on/off switch,
// projects + payouts, events, ideas worth testing, requests.
type Project = { id: string; brand: string; title: string | null; deliverables: string | null; status: string; due_at: string | null; go_live_at: string | null; fee: number | null; currency: string; invoice_sent_at: string | null; paid_at: string | null; notes: string | null; visible: boolean; source: string };
type Ev = { id: string; title: string; starts_at: string; ends_at: string | null; location: string | null; brand: string | null; details: string | null; rsvp_url: string | null; visible: boolean };
const STATUSES = ["confirmed", "in_production", "delivered", "invoiced", "paid", "cancelled"];
const money = (n: number | null, c = "USD") => (n == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(n)));

export function PortalPanel({ rosterCreatorId, name, enabled: initialEnabled, creatorEmail, projects: p0, events: e0, experiments, requests }: { rosterCreatorId: string; name: string; enabled: boolean; creatorEmail: string | null; projects: Project[]; events: Ev[]; experiments: any[]; requests: any[] }) {
  const [enabled, setEnabled] = useState(initialEnabled); const [email, setEmail] = useState(creatorEmail || "");
  const [projects, setProjects] = useState(p0); const [events, setEvents] = useState(e0);
  const [tab, setTab] = useState<"projects" | "events" | "ideas" | "requests">("projects");
  const [np, setNp] = useState<any>({ brand: "", title: "", deliverables: "", status: "confirmed", due_at: "", go_live_at: "", fee: "" });
  const [ne, setNe] = useState<any>({ title: "", starts_at: "", location: "", brand: "", rsvp_url: "" });
  const [busy, setBusy] = useState(false);
  async function call(path: string, body: any, method = "POST") { setBusy(true); const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, rosterCreatorId }) }); const j = await r.json().catch(() => ({})); setBusy(false); return r.ok ? j : (alert(j.error || "failed"), null); }
  async function toggle(on: boolean) { const j = await call("/api/portal/toggle", { enabled: on, creator_email: email }); if (j) setEnabled(on); }
  async function addProject() { const j = await call("/api/portal/projects", { ...np, fee: np.fee === "" ? null : Number(np.fee) }); if (j) { setProjects((l) => [j, ...l]); setNp({ brand: "", title: "", deliverables: "", status: "confirmed", due_at: "", go_live_at: "", fee: "" }); } }
  async function patchProject(id: string, patch: any) { const j = await call("/api/portal/projects", { id, ...patch }); if (j) setProjects((l) => l.map((x) => (x.id === id ? j : x))); }
  async function delProject(id: string) { if (!confirm("Delete this project?")) return; const j = await call("/api/portal/projects", { id }, "DELETE"); if (j) setProjects((l) => l.filter((x) => x.id !== id)); }
  async function addEvent() { const j = await call("/api/portal/events", ne); if (j) { setEvents((l) => [j, ...l]); setNe({ title: "", starts_at: "", location: "", brand: "", rsvp_url: "" }); } }
  async function delEvent(id: string) { const j = await call("/api/portal/events", { id }, "DELETE"); if (j) setEvents((l) => l.filter((x) => x.id !== id)); }
  const openReq = requests.filter((r) => r.status !== "done").length;
  return (
    <section className="card mt-8 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><div className="label">Creator portal</div><div className="text-[13px] text-muted">{enabled ? `${name} can sign in with ${email || "their email"} and see projects, payouts, hooks, launches, events and what you're pitching.` : `Off. ${name} sees nothing until you turn this on; nothing is sent either way.`}</div></div>
        <div className="flex items-center gap-2"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="creator's sign-in email" className="input-flat !w-64 !py-1.5 font-mono text-[12px]" /><button onClick={() => toggle(!enabled)} disabled={busy || (!enabled && !email)} className={`!py-1.5 !text-[12px] ${enabled ? "btn-ghost" : "btn-dark"} disabled:opacity-50`}>{enabled ? "turn off" : "turn on"}</button></div>
      </div>
      <div className="mb-4 flex gap-1 border-b border-line">{(["projects", "events", "ideas", "requests"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-[13px] ${tab === t ? "border-b-2 border-fg font-medium" : "text-muted"}`}>{t === "ideas" ? "worth testing" : t}{t === "requests" && openReq ? <span className="ml-1 rounded-full bg-accent px-1.5 text-[10px] text-white">{openReq}</span> : null}</button>)}</div>

      {tab === "projects" && (
        <div>
          <div className="mb-3 grid gap-2 md:grid-cols-[1.1fr_1fr_1.3fr_auto_auto_auto_auto_auto]">
            <input value={np.brand} onChange={(e) => setNp({ ...np, brand: e.target.value })} placeholder="brand" className="input-flat !py-1.5 text-[13px]" />
            <input value={np.title} onChange={(e) => setNp({ ...np, title: e.target.value })} placeholder="campaign" className="input-flat !py-1.5 text-[13px]" />
            <input value={np.deliverables} onChange={(e) => setNp({ ...np, deliverables: e.target.value })} placeholder="deliverables (2 reels + 3 stories)" className="input-flat !py-1.5 text-[13px]" />
            <input type="date" value={np.due_at} onChange={(e) => setNp({ ...np, due_at: e.target.value })} title="due" className="input-flat !py-1.5 font-mono text-[11px]" />
            <input type="date" value={np.go_live_at} onChange={(e) => setNp({ ...np, go_live_at: e.target.value })} title="go live" className="input-flat !py-1.5 font-mono text-[11px]" />
            <input value={np.fee} onChange={(e) => setNp({ ...np, fee: e.target.value })} placeholder="fee" type="number" className="input-flat !w-24 !py-1.5 font-mono text-[12px]" />
            <select value={np.status} onChange={(e) => setNp({ ...np, status: e.target.value })} className="input-flat !py-1.5 font-mono text-[11px]">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            <button onClick={addProject} disabled={busy || !np.brand} className="btn-dark !py-1.5 !text-[12px] disabled:opacity-50">add</button>
          </div>
          <table className="tbl"><thead><tr><th>Brand</th><th>Deliverables</th><th>Due</th><th>Live</th><th>Status</th><th className="text-right">Fee</th><th>Invoiced</th><th>Paid</th><th>Shown</th><th></th></tr></thead>
            <tbody>{projects.map((p) => (
              <tr key={p.id}>
                <td><div className="font-medium">{p.brand}</div>{p.title && <div className="num text-[10.5px] text-muted">{p.title}</div>}{p.source === "inbox" && <span className="num text-[9.5px] text-accent">from inbox</span>}</td>
                <td><input defaultValue={p.deliverables || ""} className="input-flat !w-52 !py-1 text-[12px]" onBlur={(e) => e.target.value !== (p.deliverables || "") && patchProject(p.id, { deliverables: e.target.value })} /></td>
                <td><input type="date" defaultValue={p.due_at || ""} className="input-flat !py-1 font-mono text-[11px]" onBlur={(e) => e.target.value !== (p.due_at || "") && patchProject(p.id, { due_at: e.target.value })} /></td>
                <td><input type="date" defaultValue={p.go_live_at || ""} className="input-flat !py-1 font-mono text-[11px]" onBlur={(e) => e.target.value !== (p.go_live_at || "") && patchProject(p.id, { go_live_at: e.target.value })} /></td>
                <td><select value={p.status} onChange={(e) => patchProject(p.id, { status: e.target.value })} className="input-flat !w-auto !py-1 font-mono text-[11px]">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td>
                <td className="num text-right"><input type="number" defaultValue={p.fee ?? ""} className="input-flat !w-24 !py-1 text-right font-mono text-[12px]" onBlur={(e) => Number(e.target.value) !== Number(p.fee || 0) && patchProject(p.id, { fee: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td><input type="date" defaultValue={p.invoice_sent_at || ""} className="input-flat !py-1 font-mono text-[11px]" onBlur={(e) => e.target.value !== (p.invoice_sent_at || "") && patchProject(p.id, { invoice_sent_at: e.target.value, ...(e.target.value && p.status === "delivered" ? { status: "invoiced" } : {}) })} /></td>
                <td><input type="date" defaultValue={p.paid_at || ""} className="input-flat !py-1 font-mono text-[11px]" onBlur={(e) => e.target.value !== (p.paid_at || "") && patchProject(p.id, { paid_at: e.target.value, ...(e.target.value ? { status: "paid" } : {}) })} /></td>
                <td><input type="checkbox" checked={p.visible} onChange={(e) => patchProject(p.id, { visible: e.target.checked })} title="visible to the creator" /></td>
                <td><button onClick={() => delProject(p.id)} className="num text-[11px] text-dim hover:text-bad">delete</button></td>
              </tr>))}{!projects.length && <tr><td colSpan={10} className="py-5 text-center text-muted">No projects yet. Add the confirmed campaigns; fees and payout dates show on {name}'s page as you fill them in.</td></tr>}</tbody></table>
          {projects.length > 0 && <div className="num mt-2 text-[11px] text-muted">pending payouts {money(projects.filter((p) => ["delivered", "invoiced"].includes(p.status)).reduce((s, p) => s + Number(p.fee || 0), 0))} · paid {money(projects.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.fee || 0), 0))}</div>}
        </div>
      )}

      {tab === "events" && (
        <div>
          <div className="mb-3 grid gap-2 md:grid-cols-[1.4fr_auto_1fr_1fr_1fr_auto]">
            <input value={ne.title} onChange={(e) => setNe({ ...ne, title: e.target.value })} placeholder="event" className="input-flat !py-1.5 text-[13px]" />
            <input type="datetime-local" value={ne.starts_at} onChange={(e) => setNe({ ...ne, starts_at: e.target.value })} className="input-flat !py-1.5 font-mono text-[11px]" />
            <input value={ne.location} onChange={(e) => setNe({ ...ne, location: e.target.value })} placeholder="where" className="input-flat !py-1.5 text-[13px]" />
            <input value={ne.brand} onChange={(e) => setNe({ ...ne, brand: e.target.value })} placeholder="brand (optional)" className="input-flat !py-1.5 text-[13px]" />
            <input value={ne.rsvp_url} onChange={(e) => setNe({ ...ne, rsvp_url: e.target.value })} placeholder="RSVP link" className="input-flat !py-1.5 font-mono text-[11px]" />
            <button onClick={addEvent} disabled={busy || !ne.title || !ne.starts_at} className="btn-dark !py-1.5 !text-[12px] disabled:opacity-50">add</button>
          </div>
          <div className="divide-y divide-line">{events.map((e) => <div key={e.id} className="flex items-center justify-between gap-3 py-2"><div><div className="text-[13.5px] font-medium">{e.title}{e.brand ? <span className="text-muted"> · {e.brand}</span> : null}</div><div className="num text-[10.5px] text-muted">{new Date(e.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{e.location ? ` · ${e.location}` : ""}</div></div><button onClick={() => delEvent(e.id)} className="num text-[11px] text-dim hover:text-bad">delete</button></div>)}{!events.length && <div className="py-5 text-center text-[13px] text-muted">No events yet. Shoots, brand events, launches, seasonal moments.</div>}</div>
        </div>
      )}

      {tab === "ideas" && <Experiments rows={experiments} api="/api/portal/experiments" rosterCreatorId={rosterCreatorId} />}
      {tab === "requests" && <Requests rows={requests} api="/api/portal/requests" rosterCreatorId={rosterCreatorId} />}
    </section>
  );
}
