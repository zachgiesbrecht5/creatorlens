import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
const money = (n: number | null, c = "USD") => (n == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(n)));
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const STATUS: Record<string, string> = { confirmed: "confirmed", in_production: "in production", delivered: "delivered", invoiced: "invoiced", paid: "paid", cancelled: "cancelled" };
export default async function MyProjects() {
  const { roster: r } = await requireCreator();
  const { data: projects } = await supabaseAdmin().from("projects").select("*").eq("roster_creator_id", r.id).eq("visible", true).order("created_at", { ascending: false });
  const live = (projects || []).filter((p) => !["paid", "cancelled"].includes(p.status)); const done = (projects || []).filter((p) => ["paid", "cancelled"].includes(p.status));
  const Table = ({ rows }: { rows: any[] }) => (
    <table className="tbl"><thead><tr><th>Brand</th><th>Deliverables</th><th>Due</th><th>Live</th><th>Status</th><th className="text-right">Fee</th><th>Paid</th></tr></thead>
      <tbody>{rows.map((p) => <tr key={p.id}><td><div className="font-medium">{p.brand}</div>{p.title && <div className="num text-[10.5px] text-muted">{p.title}</div>}</td><td className="text-[12.5px]">{p.deliverables}</td><td className="num text-[11px]">{d(p.due_at)}</td><td className="num text-[11px]">{d(p.go_live_at)}</td><td><span className={`pill-status ps-${p.status}`}>{STATUS[p.status] || p.status}</span></td><td className="num text-right">{money(p.fee, p.currency)}</td><td className="num text-[11px] text-muted">{p.paid_at ? d(p.paid_at) : p.invoice_sent_at ? `invoiced ${d(p.invoice_sent_at)}` : ""}</td></tr>)}{!rows.length && <tr><td colSpan={7} className="py-6 text-center text-muted">Nothing here yet.</td></tr>}</tbody></table>
  );
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5"><div className="label mb-1">Projects</div><h1 className="h1">Your campaigns</h1><p className="mt-1 text-[14px] text-muted">Every confirmed campaign, where it stands, and when it pays.</p></div>
      <div className="card mb-6 overflow-x-auto"><div className="px-4 pt-4 label">Live</div><Table rows={live} /></div>
      <div className="card overflow-x-auto"><div className="px-4 pt-4 label">Done</div><Table rows={done} /></div>
      {projects && projects.length > 0 && <div className="num mt-3 text-[11px] text-muted">Paid to date: {money(projects.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.fee || 0), 0))} · pending: {money(projects.filter((p) => ["delivered", "invoiced"].includes(p.status)).reduce((s, p) => s + Number(p.fee || 0), 0))}</div>}
    </div>
  );
}
