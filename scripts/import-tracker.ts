// One-time (re-runnable) import of Rootfor's existing data into the pool:
//   1. Team outreach tracker: Outreach Log -> contacts + outreach_log, EXCLUSIONS -> exclusions
//   2. Creator Outreach Engine: every "<name> - Raw" / "<name> IG - Raw" tab -> creators + brands + partnerships
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON,
//      TRACKER_SHEET_ID, ENGINE_SHEET_ID, ORG_ID (the Rootfor org row), IMPORT_USER_ID (Zach's profile id)
import { createClient } from "@supabase/supabase-js";
import { readTab, listTabs, brandKey } from "./google";

const env = (k: string) => process.env[k] || (() => { throw new Error("Missing " + k); })();
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const ORG = process.env.ORG_ID || null;
const USER = process.env.IMPORT_USER_ID || null;

async function brandId(name: string, mass = false): Promise<string | null> {
  const key = brandKey(name);
  if (!key) return null;
  const { data } = await sb.from("brands").upsert({ key, name: name.trim(), is_mass_sponsor: mass }, { onConflict: "key" }).select("id").single();
  return data?.id ?? null;
}

async function importTracker() {
  const id = env("TRACKER_SHEET_ID");
  const log = await readTab(id, "Outreach Log");
  // Row 1 header. Col A brand (unnamed) | Date Sent | Sent By | Creator | Contact Email | Contact Name | Subject | Status | FU1 | FU2 | Response Date | Notes | Thread
  let contacts = 0, logs = 0;
  for (const r of log.slice(1)) {
    const [brand, dateSent, sentBy, creator, email, name, subject, status, , , responseDate, , thread] = r;
    if (!brand) continue;
    const bid = await brandId(brand);
    if (!bid) continue;
    if (email && /@/.test(email)) {
      const replied = !!responseDate || /replied|response|interested|booked|closed/i.test(status || "");
      await sb.from("contacts").upsert({ brand_id: bid, email: email.trim().toLowerCase(), name: name || null, source: "tracker", verified: replied, last_replied_at: responseDate ? toDate(responseDate) : null }, { onConflict: "brand_id,email" });
      contacts++;
    }
    await sb.from("outreach_log").insert({
      org_id: ORG, user_id: USER, brand_id: bid, creator_handle: (creator || "").replace(/^@/, "").trim() || null, contact_email: email || null,
      subject: subject || null, status: mapStatus(status, responseDate), thread_link: thread || null,
      sent_at: toDate(dateSent), replied_at: responseDate ? toDate(responseDate) : null, created_at: toDate(dateSent) || new Date().toISOString(),
    });
    logs++;
  }
  console.log(`tracker: ${logs} outreach rows, ${contacts} contacts`);

  const ex = await readTab(id, "EXCLUSIONS");
  let n = 0;
  for (const r of ex.slice(1)) {
    const [key, company, , status] = r;
    if ((status || "").toUpperCase() !== "EXCLUDE") continue;
    const k = brandKey(company || key || "");
    if (!k) continue;
    await sb.from("exclusions").upsert({ org_id: ORG, brand_key: k, reason: "tracker EXCLUSIONS" }, { onConflict: "org_id,brand_key" });
    n++;
  }
  console.log(`exclusions: ${n}`);
}

async function importEngine() {
  const id = env("ENGINE_SHEET_ID");
  const tabs = (await listTabs(id)).filter((t) => t.endsWith(" - Raw"));
  console.log(`engine: ${tabs.length} raw tabs`);
  for (const tab of tabs) {
    const rows = await readTab(id, tab);
    if (rows.length < 2) continue;
    const h = rows[0].map((x) => String(x || "").toLowerCase());
    const col = (re: RegExp) => h.findIndex((x) => re.test(x));
    const cBrand = col(/^brand$/), cConf = col(/confidence/), cScore = col(/^score$/), cTitle = col(/title/), cUrl = col(/url|link/), cPub = col(/published/), cViews = col(/views/), cSig = col(/signal/), cEv = col(/evidence/), cMass = col(/mass/);
    if (cBrand < 0) continue;
    const isIg = / IG - Raw$/.test(tab);
    const isTt = / TT - Raw$/.test(tab);
    const base = tab.replace(/ (IG|TT)? ?- Raw$/, "").trim();
    const platform = isIg ? "instagram" : isTt ? "tiktok" : "youtube";
    const handle = base.toLowerCase().replace(/\s+/g, "");
    const { data: creator } = await sb.from("creators").upsert({ platform, external_id: `legacy:${handle}`, handle, display_name: base, last_scanned_at: new Date().toISOString() }, { onConflict: "platform,external_id" }).select("id").single();
    if (!creator) continue;
    const batch: any[] = [];
    for (const r of rows.slice(1)) {
      const brand = String(r[cBrand] || "").trim();
      if (!brand) continue;
      const bid = await brandId(brand, cMass >= 0 && String(r[cMass]) === "Yes");
      if (!bid) continue;
      const url = cUrl >= 0 ? String(r[cUrl] || "") : "";
      const score = cScore >= 0 ? Number(r[cScore]) || 0 : 0;
      const label = cConf >= 0 && /^(High|Medium|Low)$/.test(String(r[cConf])) ? String(r[cConf]) : score >= 5 ? "High" : score >= 3 ? "Medium" : "Low";
      batch.push({
        creator_id: creator.id, brand_id: bid, platform, content_id: url || `${tab}:${batch.length}`, content_title: cTitle >= 0 ? String(r[cTitle] || "").slice(0, 300) : null,
        content_url: url || null, published_at: cPub >= 0 ? toDate(String(r[cPub])) : null, views: cViews >= 0 ? Number(String(r[cViews]).replace(/[^0-9]/g, "")) || 0 : 0,
        confidence_score: score, confidence_label: label, signal_type: cSig >= 0 ? String(r[cSig] || "") : null, evidence: cEv >= 0 ? String(r[cEv] || "").slice(0, 400) : null,
      });
    }
    for (let i = 0; i < batch.length; i += 500) {
      const { error } = await sb.from("partnerships").upsert(batch.slice(i, i + 500), { onConflict: "creator_id,brand_id,content_id", ignoreDuplicates: true });
      if (error) console.error(tab, error.message);
    }
    console.log(`  ${tab}: ${batch.length} rows`);
  }
  // rollups
  const { data: brands } = await sb.from("brands").select("id");
  for (const b of brands || []) {
    const { data: agg } = await sb.from("partnerships").select("creator_id,published_at").eq("brand_id", b.id);
    const last = agg?.map((a) => a.published_at).filter(Boolean).sort().pop();
    await sb.from("brands").update({ deal_count: agg?.length ?? 0, creator_count: new Set(agg?.map((a) => a.creator_id)).size, last_seen: last ? String(last).slice(0, 10) : null }).eq("id", b.id);
  }
  console.log("rollups done");
}

function toDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function mapStatus(status: string | undefined, responseDate: string | undefined) {
  const s = (status || "").toLowerCase();
  if (responseDate || /replied|response|interested|booked|closed|won/.test(s)) return "replied";
  if (/declin|not interested|no\b/.test(s)) return "declined";
  if (/exclud/.test(s)) return "excluded";
  return "sent";
}

(async () => {
  const what = process.argv[2] || "all";
  if (what === "all" || what === "tracker") await importTracker();
  if (what === "all" || what === "engine") await importEngine();
})().catch((e) => { console.error(e); process.exit(1); });
