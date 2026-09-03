// Push the shared pool back into the Creator Outreach Engine sheet so the
// old views (Opportunities, Fit Scorer, creator-match skill) keep working.
// Writes two tabs: "App Partnerships" (one row per detection, same 12-col
// shape as a Raw tab plus Creator/Platform) and "App Brand Wall" (rollup).
// Run on a schedule (Railway cron / GitHub Actions, nightly).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, ENGINE_SHEET_ID
import { createClient } from "@supabase/supabase-js";
import { writeTab } from "./google";

const env = (k: string) => process.env[k] || (() => { throw new Error("Missing " + k); })();
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

(async () => {
  const sheet = env("ENGINE_SHEET_ID");
  const rows: (string | number | null)[][] = [["Date Scanned", "Creator", "Platform", "Brand", "Confidence", "Score", "Title", "URL", "Published", "Views", "Signal Type", "Evidence", "Mass Sponsor", "Status"]];
  let from = 0;
  for (;;) {
    const { data } = await sb.from("partnerships").select("scanned_at,platform,confidence_label,confidence_score,content_title,content_url,published_at,views,signal_type,evidence,status,creators(handle),brands(name,is_mass_sponsor)")
      .neq("status", "rejected").order("scanned_at", { ascending: false }).range(from, from + 999);
    if (!data?.length) break;
    for (const p of data as any[]) {
      rows.push([p.scanned_at?.slice(0, 10), p.creators?.handle, p.platform, p.brands?.name, p.confidence_label, p.confidence_score, p.content_title, p.content_url, p.published_at?.slice(0, 10) || "", p.views, p.signal_type, p.evidence, p.brands?.is_mass_sponsor ? "Yes" : "", p.status]);
    }
    if (data.length < 1000 || rows.length > 40000) break;
    from += 1000;
  }
  await writeTab(sheet, "App Partnerships", rows);
  console.log(`App Partnerships: ${rows.length - 1} rows`);

  const { data: wall } = await sb.from("brand_wall").select("*, creators(handle,platform)").order("deals", { ascending: false }).limit(20000);
  const w: (string | number | null)[][] = [["Creator", "Platform", "Brand", "Deals", "Best", "First seen", "Last seen", "Repeat partner", "Creators booked", "Evidence", "URL"]];
  for (const r of (wall || []) as any[]) w.push([r.creators?.handle, r.creators?.platform, r.brand, Number(r.deals), r.best_label, r.first_seen?.slice(0, 10) || "", r.last_seen?.slice(0, 10) || "", r.repeat_partner ? "Yes" : "", Number(r.creators_booked), r.evidence, r.content_url]);
  await writeTab(sheet, "App Brand Wall", w);
  console.log(`App Brand Wall: ${w.length - 1} rows`);
})().catch((e) => { console.error(e); process.exit(1); });
