import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
const money = (n: number | null, c = "USD") => (n == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(n)));
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const STATUS: Record<string, string> = { confirmed: "confirmed", in_production: "in production", delivered: "delivered", invoiced: "invoiced", paid: "paid", cancelled: "cancelled" };
export default async function MyProjects() {
  const { roster: r, preview } = await requireCreator();
  const { data: projects } = await supabaseAdmin().from("projects").select("*").eq("roster_creator_id", r.id).eq("visible", true).order("created_at", { ascending: false });
  const live = (projects || []).filter((p) => !["paid", "cancelled"].includes(p.status)); const done = (projects || []).filter((p) => ["paid", "cancelled"].includes(p.status));
  const Table = ({ rows }: { rows: any[] }) => (
    <table className="tbl"><thead><tr><th>Brand</th><th>Deliverables</th><th>Due</th><th>Live</th><th>Status</th><th className="text-right">Fee</th><th>Paid</th></tr></thead>
      <tbody>{rows.map((p) => <tr key={p.id}><td><div className="font-medium">{p.brand}</div>{p.title && <div className="num text-[10.5px] text-muted">{p.title}</div>}</td><td className="text-[12.5px]">{p.deliverables}</td><td className="num text-[11px]">{d(p.due_at)}</td><td className="num text-[11px]">{d(p.go_live_at)}</td><td><span className={`pill-status ps-${p.status}`}>{STATUS[p.status] || p.status}</span></td><td className="num text-right">{money(p.fee, p.currency)}</td><td className="num text-[11px] text-muted">{p.paid_at ? d(p.paid_at) : p.invoice_sent_at ? `invoiced ${d(p.invoice_sent_at)}` : ""}</td></tr>)}{!rows.length && <tr><td colSpan={7} className="py-6 text-center text-muted">Nothing here yet.</td></tr>}</tbody></table>
  );
  return (
    <div className="mx-auto max-w-6xl">
      {preview && <div className="mb-4 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-[12.5px]"><span>Previewing as <b>{r.name}</b>. This is exactly what they see; nothing here is visible to them until their portal is on.</span><a href="/api/portal/preview?clear=1" className="num text-[11px] text-accent hover:underline">end preview</a></div>}
      <div className="mb-5"><div className="label mb-1">Projects</div><h1 className="h1">{live.length} live project{live.length === 1 ? "" : "s"}</h1><p className="mt-1 text-[14px] text-muted">Every confirmed campaign, where it stands, and when it pays.</p></div>
      {(() => { const pending = live.filter((p) => ["delivered", "invoiced"].includes(p.status)).reduce((s, p) => s + Number(p.fee || 0), 0); const booked = live.reduce((s, p) => s + Number(p.fee || 0), 0); const next = [...live].filter((p) => p.due_at && new Date(p.due_at) >= new Date(Date.now() - 864e5)).sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))[0]; const month = new Date().toISOString().slice(0, 7); const paidMonth = done.filter((p) => p.status === "paid" && String(p.paid_at || "").startsWith(month)).reduce((s, p) => s + Number(p.fee || 0), 0); return (
        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Booked, live</div><div className="mt-1 text-[22px] font-bold">{money(booked)}</div><div className="num text-[10.5px] text-dim">across {live.length} project{live.length === 1 ? "" : "s"}</div></div>
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Pending payout</div><div className="mt-1 text-[22px] font-bold text-ok">{money(pending)}</div><div className="num text-[10.5px] text-dim">delivered or invoiced, not yet paid</div></div>
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Paid this month</div><div className="mt-1 text-[22px] font-bold">{money(paidMonth)}</div><div className="num text-[10.5px] text-dim">{month}</div></div>
          <div className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">Next due</div><div className="mt-1 truncate text-[16px] font-bold">{next ? next.brand : "nothing due"}</div><div className="num text-[10.5px] text-dim">{next ? `${d(next.due_at)}${next.deliverables ? ` · ${String(next.deliverables).slice(0, 40)}` : ""}` : "clear runway"}</div></div>
        </div>); })()}
      <div className="card mb-6 overflow-x-auto"><div className="px-4 pt-4 label">Live</div><Table rows={live} /></div>
      <div className="card overflow-x-auto"><div className="px-4 pt-4 label">Done</div><Table rows={done} /></div>
      {projects && projects.length > 0 && <div className="num mt-3 text-[11px] text-muted">Paid to date: {money(projects.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.fee || 0), 0))} · pending: {money(projects.filter((p) => ["delivered", "invoiced"].includes(p.status)).reduce((s, p) => s + Number(p.fee || 0), 0))}</div>}
    </div>
  );
}
