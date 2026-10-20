import Link from "next/link";
import { redirect } from "next/navigation";
import { salesNavPeopleAtCompany } from "@creatorlens/engine";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { trackerStatuses } from "@/lib/tracker";
import { SalesNavTable, type SnAccount, type SnPerson } from "@/components/SalesNavTable";
import { SalesNavConnect } from "@/components/SalesNavConnect";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales Nav | Sponsorprint" };

const HUNTER_DAILY = Number(process.env.SALESNAV_HUNTER_DAILY || 150);

export default async function SalesNav({ searchParams }: { searchParams: Promise<{ tab?: string; label?: string }> }) {
  const me = await currentProfile();
  if (!me) redirect("/login?next=/salesnav");
  if (me.plan !== "admin") redirect("/");
  const sp = await searchParams;
  const tab = sp.tab === "accounts" ? "accounts" : sp.tab === "runs" ? "runs" : "people";
  const label = sp.label || null;
  const admin = supabaseAdmin();
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const today = day.toISOString();

  const [pc, ac, pt, at, pend, spend, labels, runs] = await Promise.all([
    admin.from("salesnav_people").select("id", { count: "exact", head: true }),
    admin.from("salesnav_accounts").select("id", { count: "exact", head: true }),
    admin.from("salesnav_people").select("id", { count: "exact", head: true }).gte("first_seen", today),
    admin.from("salesnav_accounts").select("id", { count: "exact", head: true }).gte("first_seen", today),
    admin.from("salesnav_people").select("id", { count: "exact", head: true }).in("enrich_status", ["pending", "queued"]),
    admin.from("salesnav_spend").select("hunter_calls").eq("day", today.slice(0, 10)).maybeSingle(),
    admin.from("salesnav_runs").select("label,kind").not("label", "is", null).order("started_at", { ascending: false }).limit(200),
    tab === "runs" ? admin.from("salesnav_runs").select("id,kind,label,pages,rows,new_rows,stop_reason,started_at,updated_at,profiles(full_name,email)").order("started_at", { ascending: false }).limit(80) : Promise.resolve({ data: [] as any[] }),
  ]);
  const labelList = [...new Map((labels.data || []).map((l: any) => [l.label, l])).values()].filter((l: any) => l.kind === (tab === "accounts" ? "accounts" : "people")).map((l: any) => l.label as string).slice(0, 30);

  let people: SnPerson[] = [];
  let accounts: SnAccount[] = [];
  if (tab === "people") {
    let q = admin.from("salesnav_people").select("id,li_lead_id,full_name,first_name,last_name,name_partial,title,relevance,company,company_key,li_company_id,location,degree,tenure,domain,brand_id,email,email_score,email_verified,enrich_status,status,search_label,first_seen,brands(name,deal_count)").order("relevance", { ascending: false }).order("first_seen", { ascending: false }).limit(1000);
    if (label) q = q.eq("search_label", label);
    const { data } = await q;
    const rows = (data || []) as any[];
    // Tracker check per company (name + email domain), and per person (exact email).
    const comps = new Map<string, { id: string; name: string; website: string | null }>();
    for (const r of rows) { const k = `${r.company_key || r.company}|${r.domain || ""}`; if (r.company && !comps.has(k)) comps.set(k, { id: k, name: r.company, website: r.domain }); }
    const emails = rows.map((r) => r.email).filter(Boolean) as string[];
    const [ts, { data: emailed }] = await Promise.all([
      trackerStatuses(me.id, [...comps.values()]),
      emails.length ? admin.from("tracker_rows").select("contact_email,date_sent,sent_by,creator").eq("user_id", me.id).in("contact_email", emails) : Promise.resolve({ data: [] as any[] }),
    ]);
    const emailedBy = new Map((emailed || []).map((e: any) => [String(e.contact_email).toLowerCase(), e]));
    people = rows.map((r) => {
      const e = r.email ? emailedBy.get(String(r.email).toLowerCase()) : null;
      return { ...r, brand: r.brands?.name || null, brand_deals: r.brands?.deal_count || 0, li_url: `https://www.linkedin.com/sales/lead/${r.li_lead_id}`, tracker: ts[`${r.company_key || r.company}|${r.domain || ""}`] || null, emailed: e ? [e.date_sent, e.sent_by, e.creator ? `for ${e.creator}` : null].filter(Boolean).join(" · ") : null };
    });
  } else if (tab === "accounts") {
    let q = admin.from("salesnav_accounts").select("id,li_company_id,name,industry,employees,employees_n,revenue,location,about,signals,hiring,logo_url,domain,brand_id,score,score_why,status,enrich_status,emails,search_label,first_seen,brands(name,deal_count)").order("score", { ascending: false }).order("first_seen", { ascending: false }).limit(1000);
    if (label) q = q.eq("search_label", label);
    const { data } = await q;
    const rows = (data || []) as any[];
    const ts = await trackerStatuses(me.id, rows.map((r) => ({ id: r.id, name: r.name, website: r.domain })));
    const ids = rows.map((r) => r.li_company_id);
    const { data: ppl } = ids.length ? await admin.from("salesnav_people").select("li_company_id").in("li_company_id", ids) : { data: [] as any[] };
    const peopleAt = new Map<string, number>(); for (const p of ppl || []) peopleAt.set(p.li_company_id, (peopleAt.get(p.li_company_id) || 0) + 1);
    accounts = rows.map((r) => ({ ...r, brand: r.brands?.name || null, brand_deals: r.brands?.deal_count || 0, li_url: `https://www.linkedin.com/sales/company/${r.li_company_id}`, people_url: salesNavPeopleAtCompany(r.li_company_id), people_scraped: peopleAt.get(r.li_company_id) || 0, tracker: ts[r.id] || null }));
  }

  const used = spend.data?.hunter_calls || 0;
  const tabs = [{ k: "people", t: `People · ${pc.count || 0}` }, { k: "accounts", t: `Accounts · ${ac.count || 0}` }, { k: "runs", t: "Runs" }];
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-1.5">Admin · Sales Navigator</div>
          <h1 className="h2">Sales Nav leads</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Everything the Sales Nav extension pulls lands here. Emails are found in the background with the house Hunter key, only for creator-facing titles unless you ask. Admins only; nothing here reaches other Sponsorprint users.</p>
        </div>
        <SalesNavConnect hasKey={!!me.api_key} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat n={pt.count || 0} t="people today" />
        <Stat n={at.count || 0} t="accounts today" />
        <Stat n={pend.count || 0} t="emails being found" />
        <Stat n={`${used}/${HUNTER_DAILY}`} t="Hunter calls today" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((x) => <Link key={x.k} href={`/salesnav?tab=${x.k}`} className={`pill ${tab === x.k ? "pill-accent" : "hover:border-fg"}`}>{x.t}</Link>)}
        {tab !== "runs" && labelList.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-1.5 text-[12px] text-muted">search:
            <Link href={`/salesnav?tab=${tab}`} className={`pill ${!label ? "pill-accent" : ""}`}>all</Link>
            {labelList.slice(0, 8).map((l) => <Link key={l} href={`/salesnav?tab=${tab}&label=${encodeURIComponent(l)}`} className={`pill max-w-[220px] truncate ${label === l ? "pill-accent" : ""}`} title={l}>{l}</Link>)}
          </span>
        )}
      </div>

      {tab === "runs" ? (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted"><tr><th className="p-3">Started</th><th className="p-3">Who</th><th className="p-3">Kind</th><th className="p-3">Search</th><th className="p-3 text-right">Pages</th><th className="p-3 text-right">Rows</th><th className="p-3 text-right">New</th><th className="p-3">Stopped because</th></tr></thead>
            <tbody>
              {(runs.data || []).map((r: any) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="num p-3 text-muted">{new Date(r.started_at).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Winnipeg" })}</td>
                  <td className="p-3">{r.profiles?.full_name || r.profiles?.email || "?"}</td>
                  <td className="p-3">{r.kind}</td>
                  <td className="max-w-[280px] truncate p-3" title={r.label || ""}>{r.label || "-"}</td>
                  <td className="num p-3 text-right">{r.pages}</td>
                  <td className="num p-3 text-right">{r.rows}</td>
                  <td className="num p-3 text-right">{r.new_rows}</td>
                  <td className="p-3 text-muted">{r.stop_reason || "-"}</td>
                </tr>
              ))}
              {!(runs.data || []).length && <tr><td colSpan={8} className="p-6 text-center text-muted">No runs yet. Open a Sales Nav search and press Start in the panel.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <SalesNavTable kind={tab} people={people} accounts={accounts} />
      )}
    </div>
  );
}

function Stat({ n, t }: { n: number | string; t: string }) {
  return <div className="card p-4"><div className="num text-xl font-semibold">{n}</div><div className="text-[12px] text-muted">{t}</div></div>;
}
