"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrackerStatus } from "@/lib/tracker";
import { TrackerChip } from "@/components/TrackerChip";

export type SnPerson = {
  id: string; li_lead_id: string; li_url: string; full_name: string; first_name: string | null; last_name: string | null; name_partial: boolean;
  title: string | null; relevance: number; company: string | null; li_company_id: string | null; location: string | null; degree: string | null; tenure: string | null;
  domain: string | null; brand: string | null; brand_deals: number; email: string | null; email_score: number | null; email_verified: boolean;
  enrich_status: string; status: string; search_label: string | null; first_seen: string; tracker: TrackerStatus | null; emailed: string | null;
};
export type SnAccount = {
  id: string; li_company_id: string; li_url: string; people_url: string; people_scraped: number; name: string; industry: string | null; employees: string | null; employees_n: number | null;
  revenue: string | null; location: string | null; about: string | null; signals: string[]; hiring: boolean; logo_url: string | null; domain: string | null;
  brand: string | null; brand_deals: number; score: number; score_why: string[]; status: string; enrich_status: string;
  emails: { email: string; name?: string | null; title?: string | null; bucket: string; confidence?: number | null }[]; search_label: string | null; first_seen: string; tracker: TrackerStatus | null;
};

const ENRICH: Record<string, { t: string; c: string }> = {
  pending: { t: "finding…", c: "pill-warn" }, queued: { t: "finding…", c: "pill-warn" }, done: { t: "found", c: "pill-ok" },
  not_found: { t: "not found", c: "pill-bad" }, no_domain: { t: "no domain", c: "pill-bad" }, partial_name: { t: "surname hidden", c: "" }, skipped: { t: "not looked up", c: "" }, failed: { t: "failed", c: "pill-bad" },
};

export function SalesNavTable({ kind, people, accounts }: { kind: "people" | "accounts"; people: SnPerson[]; accounts: SnAccount[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (kind === "people") return people.filter((p) => {
      if (needle && ![p.full_name, p.title, p.company, p.location, p.email].join(" ").toLowerCase().includes(needle)) return false;
      if (filter === "email") return !!p.email;
      if (filter === "noemail") return !p.email;
      if (filter === "creator") return p.relevance >= 2;
      if (filter === "clean") return (!p.tracker || p.tracker.state === "clean" || p.tracker.state === "old") && !p.emailed;
      if (filter === "target") return p.status === "target";
      return p.status !== "skip" || filter === "skip";
    });
    return accounts.filter((a) => {
      if (needle && ![a.name, a.industry, a.location, a.signals.join(" "), a.brand].join(" ").toLowerCase().includes(needle)) return false;
      if (filter === "hot") return a.score >= 4;
      if (filter === "index") return !!a.brand && a.brand_deals > 0;
      if (filter === "clean") return !a.tracker || a.tracker.state === "clean" || a.tracker.state === "old";
      if (filter === "target") return a.status === "target";
      return a.status !== "skip" || filter === "skip";
    });
  }, [kind, people, accounts, q, filter]);

  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)));

  async function act(action: string) {
    const ids = [...sel]; if (!ids.length) return;
    if (action === "delete" && !window.confirm(`Delete ${ids.length} row${ids.length === 1 ? "" : "s"} from Sponsorprint? This does not touch LinkedIn.`)) return;
    setBusy(true); setNote(null);
    const r = await fetch("/api/salesnav/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ table: kind, ids, action }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    setNote(r.ok ? (action === "find_email" || action === "enrich" ? `Queued ${ids.length}. Emails arrive in a minute or two; refresh to see them.` : `Updated ${ids.length}.`) : r.error || "That didn't work.");
    setSel(new Set()); router.refresh();
  }

  async function copySheets() {
    const pick = sel.size ? rows.filter((r) => sel.has(r.id)) : rows;
    let tsv = "";
    const clean = (v: unknown) => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();
    if (kind === "people") {
      tsv = ["First Name", "Last Name", "Full Name", "Title", "Company", "Brand in Sponsorprint", "Location", "Email", "Email Score", "Email Status", "Tracker", "Sales Nav URL", "Search"].join("\t") + "\n" +
        (pick as SnPerson[]).map((p) => [p.first_name, p.last_name, p.full_name, p.title, p.company, p.brand, p.location, p.email, p.email_score, ENRICH[p.enrich_status]?.t || p.enrich_status, p.emailed ? `emailed ${p.emailed}` : p.tracker?.label, p.li_url, p.search_label].map(clean).join("\t")).join("\n");
    } else {
      const em = (a: SnAccount, b: string) => a.emails.filter((e) => e.bucket === b).map((e) => e.email).join(", ");
      tsv = ["Company", "Score", "Why", "Industry", "Employees", "Revenue", "Location", "Hiring", "Signals", "Domain", "Partnerships Email", "Marketing Emails", "General Email", "Brand in Sponsorprint", "Creator Deals", "Tracker", "Sales Nav URL", "Find Marketing People", "Search"].join("\t") + "\n" +
        (pick as SnAccount[]).map((a) => [a.name, a.score, a.score_why.join("; "), a.industry, a.employees, a.revenue, a.location, a.hiring ? "yes" : "", a.signals.join("; "), a.domain, em(a, "partnerships"), em(a, "marketing"), em(a, "general"), a.brand, a.brand_deals || "", a.tracker?.label, a.li_url, a.people_url, a.search_label].map(clean).join("\t")).join("\n");
    }
    try { await navigator.clipboard.writeText(tsv); setNote(`Copied ${pick.length} row${pick.length === 1 ? "" : "s"}. Paste into Google Sheets with Cmd+V.`); }
    catch { setNote("Clipboard blocked by the browser. Try again after clicking the page."); }
  }

  const chips = kind === "people"
    ? [["all", "All"], ["creator", "Creator-facing"], ["email", "Has email"], ["noemail", "No email yet"], ["clean", "Not contacted"], ["target", "Targets"], ["skip", "Skipped"]]
    : [["all", "All"], ["hot", "Score 4+"], ["index", "Pays creators"], ["clean", "Not contacted"], ["target", "Targets"], ["skip", "Skipped"]];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "people" ? "Search name, title, company…" : "Search company, industry, signal…"} className="input !w-72 !py-1.5 text-[13px]" />
        {chips.map(([k, t]) => <button key={k} onClick={() => setFilter(k)} className={`pill ${filter === k ? "pill-accent" : "hover:border-fg"}`}>{t}</button>)}
        <span className="num ml-auto text-[12px] text-muted">{rows.length} shown{sel.size ? ` · ${sel.size} selected` : ""}</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={copySheets} className="btn-dark !py-1.5 !text-[12px]">Copy for Sheets{sel.size ? ` (${sel.size})` : ""}</button>
        {kind === "people"
          ? <button onClick={() => act("find_email")} disabled={busy || !sel.size} className="btn-ghost !py-1.5 !text-[12px]">Find email</button>
          : <button onClick={() => act("enrich")} disabled={busy || !sel.size} className="btn-ghost !py-1.5 !text-[12px]">Find emails</button>}
        <button onClick={() => act("target")} disabled={busy || !sel.size} className="btn-ghost !py-1.5 !text-[12px]">Mark target</button>
        <button onClick={() => act("pitched")} disabled={busy || !sel.size} className="btn-ghost !py-1.5 !text-[12px]">Mark pitched</button>
        <button onClick={() => act("skip")} disabled={busy || !sel.size} className="btn-ghost !py-1.5 !text-[12px]">Skip</button>
        <button onClick={() => act("new")} disabled={busy || !sel.size} className="btn-ghost !py-1.5 !text-[12px]">Reset</button>
        <button onClick={() => act("delete")} disabled={busy || !sel.size} className="btn-ghost !py-1.5 !text-[12px] text-bad">Delete</button>
        {note && <span className="text-[12px] text-muted">{note}</span>}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-[13px]">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
            {kind === "people"
              ? <tr><th className="w-8 p-3"><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all" /></th><th className="p-3">Person</th><th className="p-3">Company</th><th className="p-3">Email</th><th className="p-3">Outreach</th></tr>
              : <tr><th className="w-8 p-3"><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all" /></th><th className="p-3">Account</th><th className="p-3 text-center">Score</th><th className="p-3">Signals</th><th className="p-3">Emails</th><th className="p-3">Outreach</th></tr>}
          </thead>
          <tbody>
            {kind === "people" && (rows as SnPerson[]).map((p) => (
              <tr key={p.id} className={`border-t border-line align-top ${p.status === "skip" ? "opacity-50" : ""}`}>
                <td className="p-3"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.full_name}`} /></td>
                <td className="p-3">
                  <a href={p.li_url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{p.full_name}</a>
                  {p.degree && <span className="ml-1.5 text-[11px] text-dim">{p.degree}</span>}
                  {p.status === "target" && <span className="pill pill-accent ml-2 !py-0 !text-[10px]">target</span>}
                  {p.status === "pitched" && <span className="pill ml-2 !py-0 !text-[10px]">pitched</span>}
                  <div className="text-muted">{p.title || "-"}{p.relevance >= 3 && <span className="ml-1.5 text-[11px] text-ok">creator-facing</span>}</div>
                  {p.location && <div className="text-[12px] text-dim">{p.location}</div>}
                </td>
                <td className="p-3">
                  <div>{p.company || "-"}</div>
                  {p.brand && <div className="text-[12px] text-ok" title="Matched to a brand in the Sponsorprint index">{p.brand_deals > 0 ? `pays creators · ${p.brand_deals} deal${p.brand_deals === 1 ? "" : "s"}` : "in Sponsorprint"}</div>}
                  {p.domain && <div className="num text-[11px] text-dim">{p.domain}</div>}
                </td>
                <td className="p-3">
                  {p.email ? <><code className="select-all text-[12px]">{p.email}</code><div className="text-[11px] text-dim">{p.email_verified ? "verified" : "unverified"}{p.email_score != null ? ` · ${p.email_score}` : ""}</div></> : <span className={`pill !text-[11px] ${ENRICH[p.enrich_status]?.c || ""}`}>{ENRICH[p.enrich_status]?.t || p.enrich_status}</span>}
                </td>
                <td className="p-3">{p.emailed ? <span className="tc tc-recent" title="This exact address is in the outreach tracker">emailed · {p.emailed}</span> : <TrackerChip s={p.tracker} />}</td>
              </tr>
            ))}
            {kind === "accounts" && (rows as SnAccount[]).map((a) => (
              <tr key={a.id} className={`border-t border-line align-top ${a.status === "skip" ? "opacity-50" : ""}`}>
                <td className="p-3"><input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${a.name}`} /></td>
                <td className="p-3">
                  <div className="flex items-start gap-2.5">
                    {a.logo_url ? <img src={a.logo_url} alt="" className="mt-0.5 h-7 w-7 rounded border border-line object-contain" /> : <div className="mt-0.5 h-7 w-7 rounded border border-line bg-surface2" />}
                    <div>
                      <a href={a.li_url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{a.name}</a>
                      {a.status === "target" && <span className="pill pill-accent ml-2 !py-0 !text-[10px]">target</span>}
                      {a.status === "pitched" && <span className="pill ml-2 !py-0 !text-[10px]">pitched</span>}
                      <div className="text-muted">{[a.industry, a.employees, a.revenue].filter(Boolean).join(" · ") || "-"}</div>
                      {a.domain && <div className="num text-[11px] text-dim">{a.domain}</div>}
                      <a href={a.people_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] text-accent hover:underline">Find marketing people ↗</a>
                      {a.people_scraped > 0 && <span className="ml-2 text-[11px] text-dim">{a.people_scraped} scraped</span>}
                    </div>
                  </div>
                </td>
                <td className="p-3 text-center"><span className={`num inline-block min-w-[28px] rounded-md px-2 py-0.5 font-semibold ${a.score >= 4 ? "bg-accent text-white" : "bg-surface2"}`} title={a.score_why.join("\n") || "no signals"}>{a.score}</span></td>
                <td className="max-w-[240px] p-3 text-[12px]">
                  {a.brand && <div className="text-ok">{a.brand_deals > 0 ? `pays creators · ${a.brand_deals} deal${a.brand_deals === 1 ? "" : "s"}` : "in Sponsorprint"}</div>}
                  {a.hiring && <div>hiring now</div>}
                  {a.signals.filter((s) => !/hiring/i.test(s)).slice(0, 3).map((s) => <div key={s} className="text-muted">{s}</div>)}
                </td>
                <td className="p-3 text-[12px]">
                  {a.emails.length ? a.emails.filter((e) => e.bucket !== "other").slice(0, 4).map((e) => <div key={e.email}><code className="select-all">{e.email}</code> <span className="text-dim">{e.bucket === "general" ? "general inbox" : e.title || e.bucket}</span></div>) : <span className={`pill !text-[11px] ${ENRICH[a.enrich_status]?.c || ""}`}>{ENRICH[a.enrich_status]?.t || a.enrich_status}</span>}
                  {a.emails.length > 0 && !a.emails.some((e) => e.bucket !== "other") && <span className="text-dim">only non-marketing staff found</span>}
                </td>
                <td className="p-3"><TrackerChip s={a.tracker} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="p-8 text-center text-muted">{(kind === "people" ? people : accounts).length ? "Nothing matches that filter." : "Nothing scraped yet. Open a Sales Nav search, press Start in the Sponsorprint panel, and rows land here."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
