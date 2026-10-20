import { NextResponse, type NextRequest } from "next/server";
import { cleanPersonName, splitName, titleRelevance, companyKey, parseEmployees, parseRevenue, scoreAccount, type SalesNavPersonIn, type SalesNavAccountIn } from "@creatorlens/engine";
import { supabaseAdmin } from "@/lib/supabase";
import { salesNavAdmin, brandsByCompany, brandFor } from "@/lib/salesnav";

// The Sponsorprint Sales Nav extension posts one results page at a time here.
//   GET  -> connection check for the extension popup ({ ok, email, today })
//   POST { kind: "people" | "accounts", rows: [...], label?, run_id?, page?, stop_reason? }
// Auth: Authorization: Bearer sp_... (the admin's Sponsorprint API key) or an admin session.

const str = (v: unknown, max = 300) => { const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""; return s ? s.slice(0, max) : null; };
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); };

export async function GET(req: NextRequest) {
  const a = await salesNavAdmin(req);
  if (!a.profile) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const admin = supabaseAdmin();
  const [{ count: people }, { count: accounts }] = await Promise.all([
    admin.from("salesnav_people").select("id", { count: "exact", head: true }).gte("first_seen", dayStart()),
    admin.from("salesnav_accounts").select("id", { count: "exact", head: true }).gte("first_seen", dayStart()),
  ]);
  return NextResponse.json({ ok: true, email: a.profile.email, today: { people: people || 0, accounts: accounts || 0 } });
}

export async function POST(req: NextRequest) {
  const a = await salesNavAdmin(req);
  if (!a.profile) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const body = await req.json().catch(() => null);
  const kind = body?.kind === "accounts" ? "accounts" : body?.kind === "people" ? "people" : null;
  if (!kind) return NextResponse.json({ ok: false, error: "kind must be people or accounts" }, { status: 400 });
  const rows: any[] = Array.isArray(body.rows) ? body.rows.slice(0, 100) : [];
  const label = str(body.label, 160);
  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  // Run bookkeeping: one row per Start press in the extension.
  let runId: string | null = typeof body.run_id === "string" && /^[0-9a-f-]{36}$/.test(body.run_id) ? body.run_id : null;
  if (!runId) {
    const { data: run } = await admin.from("salesnav_runs").insert({ user_id: a.profile.id, kind, label }).select("id").single();
    runId = run?.id || null;
  }

  let fresh = 0, updated = 0;
  if (kind === "people") {
    const people = rows.map((r: SalesNavPersonIn) => {
      const lead = str(r.lead_id, 120);
      const name = cleanPersonName(r.name);
      if (!lead || !name) return null;
      const sp = splitName(name);
      const title = str(r.title, 200);
      return { li_lead_id: lead, full_name: name, first_name: sp.first, last_name: sp.last, name_partial: sp.partial, title, relevance: titleRelevance(title), company: str(r.company, 160), company_key: companyKey(r.company), li_company_id: str(r.company_id, 40), location: str(r.location, 160), degree: str(r.degree, 10), tenure: str(r.tenure, 120), about: str(r.about, 600), photo_url: str(r.photo, 600) };
    }).filter(Boolean) as any[];
    if (people.length) {
      const brands = await brandsByCompany(people.map((p) => p.company).filter(Boolean));
      const coIds = [...new Set(people.map((p) => p.li_company_id).filter(Boolean))] as string[];
      const [{ data: accts }, { data: existing }] = await Promise.all([
        coIds.length ? admin.from("salesnav_accounts").select("li_company_id,domain,brand_id").in("li_company_id", coIds) : Promise.resolve({ data: [] as any[] }),
        admin.from("salesnav_people").select("id,li_lead_id,company_key").in("li_lead_id", people.map((p) => p.li_lead_id)),
      ]);
      const acctBy = new Map((accts || []).map((x: any) => [x.li_company_id, x]));
      const have = new Map((existing || []).map((x: any) => [x.li_lead_id, x]));
      const inserts: any[] = [];
      for (const p of people) {
        const b = brandFor(brands, p.company);
        const acct = p.li_company_id ? acctBy.get(p.li_company_id) : null;
        const brand_id = b?.id || acct?.brand_id || null;
        const domain = acct?.domain || b?.domain || null;
        const prev = have.get(p.li_lead_id);
        if (prev) {
          // Keep enrichment unless they moved companies (then the old email is wrong).
          const moved = prev.company_key && p.company_key && prev.company_key !== p.company_key;
          await admin.from("salesnav_people").update({ ...p, brand_id, ...(domain ? { domain } : {}), last_seen: now, ...(label ? { search_label: label } : {}), ...(moved ? { email: null, email_score: null, email_verified: false, contact_id: null, enrich_status: enrichStart(p), enriched_at: null } : {}) }).eq("id", prev.id);
          updated++;
        } else {
          inserts.push({ ...p, brand_id, domain, enrich_status: enrichStart(p), search_label: label, scraped_by: a.profile.id });
        }
      }
      if (inserts.length) { const { error } = await admin.from("salesnav_people").insert(inserts); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); fresh = inserts.length; }
    }
  } else {
    const accts = rows.map((r: SalesNavAccountIn) => {
      const id = str(r.company_id, 40); const name = str(r.name, 160);
      if (!id || !name) return null;
      const signals = (Array.isArray(r.signals) ? r.signals : []).map((s) => str(s, 80)).filter(Boolean) as string[];
      const employees = str(r.employees, 60);
      return { li_company_id: id, name, key: companyKey(name), industry: str(r.industry, 120), employees, employees_n: parseEmployees(employees), revenue: str(r.revenue, 60) || parseRevenue(r.text), location: str(r.location, 160), about: str(r.about, 800), signals: [...new Set(signals)].slice(0, 8), hiring: !!r.hiring || signals.some((s) => /hiring/i.test(s)), logo_url: str(r.logo, 600) };
    }).filter(Boolean) as any[];
    if (accts.length) {
      const brands = await brandsByCompany(accts.map((x) => x.name));
      const { data: existing } = await admin.from("salesnav_accounts").select("id,li_company_id,domain").in("li_company_id", accts.map((x) => x.li_company_id));
      const have = new Map((existing || []).map((x: any) => [x.li_company_id, x]));
      const inserts: any[] = [];
      for (const x of accts) {
        const b = brandFor(brands, x.name);
        const sc = scoreAccount({ ...x, in_index_deals: b?.deal_count || 0 });
        const row = { ...x, brand_id: b?.id || null, score: sc.score, score_why: sc.why };
        const prev = have.get(x.li_company_id);
        if (prev) { await admin.from("salesnav_accounts").update({ ...row, ...(!prev.domain && b?.domain ? { domain: b.domain } : {}), last_seen: now, ...(label ? { search_label: label } : {}) }).eq("id", prev.id); updated++; }
        else inserts.push({ ...row, domain: b?.domain || null, search_label: label, scraped_by: a.profile.id });
      }
      if (inserts.length) { const { error } = await admin.from("salesnav_accounts").insert(inserts); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); fresh = inserts.length; }
      // People already scraped at these companies pick up the account's brand link.
      for (const x of accts) { const b = brandFor(brands, x.name); if (b) await admin.from("salesnav_people").update({ brand_id: b.id }).eq("li_company_id", x.li_company_id).is("brand_id", null); }
    }
  }

  if (runId) {
    const { data: run } = await admin.from("salesnav_runs").select("pages,rows,new_rows").eq("id", runId).maybeSingle();
    if (run) await admin.from("salesnav_runs").update({ pages: run.pages + (rows.length ? 1 : 0), rows: run.rows + fresh + updated, new_rows: run.new_rows + fresh, updated_at: now, ...(str(body.stop_reason) ? { stop_reason: str(body.stop_reason, 200) } : {}) }).eq("id", runId);
  }
  return NextResponse.json({ ok: true, run_id: runId, new: fresh, updated });
}

/** Where enrichment starts for a new person: only creator-facing titles spend Hunter credits automatically. */
function enrichStart(p: { name_partial: boolean; relevance: number }) {
  if (p.name_partial) return "partial_name";
  return p.relevance >= 2 ? "pending" : "skipped";
}
