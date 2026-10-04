// Outreach tracker sync. Hourly, for every account with a tracker sheet and a
// Google connection: read the Outreach Log and the exclusion tabs through the
// Sheets API (read-only scope) and replace that account's tracker_rows. Parsing
// is defensive: rows whose date column isn't a date are skipped, brands match by
// normalized name and by email domain. Column layout follows Rootfor's sheet
// (first unlabeled column = brand) but is detected from headers when present.
import type { SupabaseClient } from "@supabase/supabase-js";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[tracker]", ...a);
const key = (s: string) => String(s || "").toLowerCase().replace(/\b(the|inc|llc|ltd|co|corp|company)\b/g, "").replace(/[^a-z0-9]/g, "");
const domainOf = (email: string) => { const m = String(email || "").toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/); return m ? m[1].replace(/^(mail|email|hello|hi)\./, "") : null; };
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(String(s || "")) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(s || ""));
const toDate = (s: string) => { const t = String(s || "").trim(); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; } return null; };

async function accessToken(refreshToken: string): Promise<string | null> {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  if (!r.ok) return null;
  return ((await r.json()) as any).access_token || null;
}
async function readTab(token: string, sheetId: string, tab: string): Promise<string[][] | null> {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return ((await r.json()) as any).values || [];
}
async function tabNames(token: string, sheetId: string): Promise<string[]> {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  return (((await r.json()) as any).sheets || []).map((s: any) => s.properties?.title).filter(Boolean);
}

export async function syncTrackers(sb: SupabaseClient): Promise<number> {
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const { data: users } = await sb.from("profiles").select("id,tracker_sheet_id,tracker_synced_at").not("tracker_sheet_id", "is", null).or(`tracker_synced_at.is.null,tracker_synced_at.lt.${hourAgo}`).limit(20);
  let total = 0;
  for (const u of users || []) {
    const { data: gc } = await sb.from("google_connections").select("refresh_token").eq("user_id", u.id).maybeSingle();
    if (!gc?.refresh_token) { await sb.from("profiles").update({ tracker_note: "Connect Gmail (with the sheet permission) to sync the tracker", tracker_synced_at: new Date().toISOString() }).eq("id", u.id); continue; }
    const token = await accessToken(gc.refresh_token);
    if (!token) { await sb.from("profiles").update({ tracker_note: "Google connection expired; reconnect Gmail", tracker_synced_at: new Date().toISOString() }).eq("id", u.id); continue; }
    const tabs = await tabNames(token, u.tracker_sheet_id);
    if (!tabs.length) { await sb.from("profiles").update({ tracker_note: "Could not open the sheet: reconnect Gmail to grant the sheet permission, and check the link", tracker_synced_at: new Date().toISOString() }).eq("id", u.id); continue; }
    const rows: any[] = [];
    const logTabs = tabs.filter((t) => /outreach|log|sent|pitch/i.test(t)); const exTabs = tabs.filter((t) => /exclu|do not|dnc|blacklist/i.test(t));
    for (const tab of [...logTabs, ...exTabs]) {
      const kind = exTabs.includes(tab) ? "exclude" : "outreach";
      const values = await readTab(token, u.tracker_sheet_id, tab); if (!values?.length) continue;
      // header detection: find the row that mentions a date/brand column; default to Rootfor layout
      const hdrIdx = values.findIndex((r) => r.some((c) => /date sent|sent by|brand/i.test(String(c))));
      const hdr = (hdrIdx >= 0 ? values[hdrIdx] : []).map((c) => String(c).toLowerCase());
      const col = (names: RegExp, fallback: number) => { const i = hdr.findIndex((h) => names.test(h)); return i >= 0 ? i : fallback; };
      const cBrand = col(/^brand|company/, 0), cDate = col(/date sent|^date$/, 1), cBy = col(/sent by|sender/, 2), cCreator = col(/creator|talent/, 3), cEmail = col(/email/, 4), cStatus = col(/status|result/, 7), cNotes = col(/note/, 11);
      for (let i = hdrIdx + 1; i < values.length; i++) {
        const r = values[i]; const brand = String(r[cBrand] || "").trim(); if (!brand || brand.length > 80) continue;
        const date = toDate(String(r[cDate] || ""));
        if (kind === "outreach" && !date) continue;   // banners, header repeats, CHECK markers
        rows.push({ user_id: u.id, tab: kind, brand, brand_key: key(brand), domain: domainOf(String(r[cEmail] || "")), date_sent: date, sent_by: String(r[cBy] || "").trim() || null, creator: String(r[cCreator] || "").trim() || null, contact_email: String(r[cEmail] || "").trim() || null, status: String(r[cStatus] || "").trim() || null, notes: String(r[cNotes] || "").trim().slice(0, 300) || null });
      }
    }
    const outreachCount = rows.filter((r) => r.tab === "outreach").length;
    if (outreachCount < 50 && rows.length < 100) { await sb.from("profiles").update({ tracker_note: `Sheet read looks incomplete (${rows.length} rows); kept the previous sync`, tracker_synced_at: new Date().toISOString() }).eq("id", u.id); log(u.id, "short read, skipped"); continue; }
    await sb.from("tracker_rows").delete().eq("user_id", u.id);
    for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from("tracker_rows").insert(rows.slice(i, i + 500)); if (error) { log("insert failed", error.message); break; } }
    await sb.from("profiles").update({ tracker_synced_at: new Date().toISOString(), tracker_note: `${outreachCount} pitches, ${rows.length - outreachCount} exclusions, synced ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` }).eq("id", u.id);
    total += rows.length;
    log(u.id, "synced", rows.length, "rows from", logTabs.length + exTabs.length, "tabs");
  }
  return total;
}
