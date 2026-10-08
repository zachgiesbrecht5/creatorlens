import Link from "next/link";
import { requireCreator } from "@/lib/creator-portal";
import { pitchedFor, dShort } from "@/lib/me-stats";

// Pitched-this-week tile -> page. Brand names and where each one stands. No contact names, no emails,
// no notes: that layer stays with the team.
const STAGES: { key: "conversation" | "followup" | "pitched" | "declined"; label: string; hint: string; cls: string }[] = [
  { key: "conversation", label: "In conversation", hint: "replied, interested, on a call or negotiating", cls: "text-ok" },
  { key: "followup", label: "Following up", hint: "pitched, no reply yet, your team has nudged", cls: "text-fg" },
  { key: "pitched", label: "Pitched", hint: "first email out, waiting", cls: "text-muted" },
  { key: "declined", label: "Passed", hint: "not now; stays on the list for next season", cls: "text-dim" },
];
export default async function MyPitched() {
  const { roster: r, preview } = await requireCreator();
  const first = r.name.split(" ")[0];
  const rows = await pitchedFor(r.user_id, first, 60);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const thisWeek = rows.filter((x) => (x.date_sent || "") >= weekAgo);
  const convo = rows.filter((x) => x.stage === "conversation");
  return (
    <div className="mx-auto max-w-5xl">
      {preview && <div className="mb-4 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-[12.5px]"><span>Previewing as <b>{r.name}</b>.</span><a href="/api/portal/preview?clear=1" className="num text-[11px] text-accent hover:underline">end preview</a></div>}
      <div className="mb-5"><div className="label mb-1"><Link href="/me" className="hover:text-accent">Home</Link> · pitched</div><h1 className="h1">{thisWeek.length} brand{thisWeek.length === 1 ? "" : "s"} pitched this week</h1><p className="mt-1 text-[14px] text-muted">{rows.length} brands your team has pitched for you in the last 60 days, and where each one stands. If you're already making content a brand here would want, tell your manager; it moves the conversation.</p></div>
      <div className="grid gap-3 sm:grid-cols-4">
        {STAGES.map((s) => { const n = rows.filter((x) => x.stage === s.key).length; return <div key={s.key} className="card p-4"><div className="num text-[10px] uppercase tracking-[0.12em] text-muted">{s.label}</div><div className={`mt-1 text-[22px] font-bold ${s.cls}`}>{n}</div><div className="num text-[10.5px] text-dim">{s.hint}</div></div>; })}
      </div>
      {convo.length > 0 && (
        <div className="card mt-4 p-5" style={{ borderTop: "3px solid #1f9d55" }}>
          <div className="label mb-1">In conversation</div>
          <p className="mb-3 text-[13px] text-muted">These brands replied. Content that fits them in the next few weeks is the strongest thing you can do for the deal.</p>
          <div className="flex flex-wrap gap-2">{convo.sort((a, b) => String(b.date_sent).localeCompare(String(a.date_sent))).map((x) => <span key={x.brand} className="rounded-full border border-ok/40 bg-okSoft/60 px-3 py-1 text-[13px]"><b>{x.brand}</b><span className="num ml-1.5 text-[10.5px] text-muted">{x.status} · {dShort(x.date_sent)}</span></span>)}</div>
        </div>
      )}
      <div className="card mt-4 overflow-x-auto">
        <table className="tbl"><thead><tr><th>Brand</th><th>Stage</th><th>Status in tracker</th><th>First pitched</th></tr></thead>
          <tbody>{rows.sort((a, b) => STAGES.findIndex((s) => s.key === a.stage) - STAGES.findIndex((s) => s.key === b.stage) || String(b.date_sent).localeCompare(String(a.date_sent))).map((x) => { const s = STAGES.find((z) => z.key === x.stage)!; return (
            <tr key={x.brand}><td className="font-medium">{x.brand}</td><td className={`num text-[11.5px] ${s.cls}`}>{s.label}</td><td className="num text-[11px] text-muted">{x.status || ""}</td><td className="num text-[11px] text-muted">{dShort(x.date_sent)}</td></tr>); })}
            {!rows.length && <tr><td colSpan={4} className="py-6 text-center text-muted">Nothing in the last 60 days. Your team's outreach shows up here as it's logged.</td></tr>}</tbody></table>
      </div>
      <div className="num mt-3 text-[10.5px] text-dim">Read from your team's outreach tracker. Who was emailed and what was said stays with the team.</div>
    </div>
  );
}
