// Per-creator project tracker sync. Hourly: read each linked Google Sheet with the
// roster owner's Google connection, map rows to projects (keyed by brand + month),
// and upsert. Column names are detected from the header; Rootfor's layout is the
// default (Brand, Month of Project, Deliverables, Stage, DUE DATE, Live Date,
// Project Progress, Rate (USD), Rate to <creator>, Notes).
import type { SupabaseClient } from "@supabase/supabase-js";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[projectsheets]", ...a);
const money = (s: string) => { const n = Number(String(s || "").replace(/[^0-9.]/g, "")); return isFinite(n) && n > 0 ? n : null; };
const toDate = (s: string) => { const t = String(s || "").trim(); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; } return null; };
const statusOf = (progress: string, stage: string) => { const p = progress.toLowerCase(), st = stage.toLowerCase(); if (p.startsWith("paid")) return "paid"; if (p.startsWith("invoic")) return "invoiced"; if (p.includes("cancel") || st.includes("cancel")) return "cancelled"; if (st.includes("submitted") || st === "completed" || st.includes("delivered")) return "delivered"; if (st.includes("due") || st.includes("production") || st.includes("filming") || p.includes("progress")) return "in_production"; return "confirmed"; };

async function accessToken(refreshToken: string): Promise<string | null> {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  return r.ok ? (((await r.json()) as any).access_token || null) : null;
}

export async function syncProjectSheets(sb: SupabaseClient): Promise<number> {
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const { data: rows } = await sb.from("roster_creators").select("id,user_id,name,project_sheet_id,project_sheet_synced_at").not("project_sheet_id", "is", null).or(`project_sheet_synced_at.is.null,project_sheet_synced_at.lt.${hourAgo}`).limit(30);
  let total = 0;
  for (const r of rows || []) {
    const note = async (n: string) => sb.from("roster_creators").update({ project_sheet_note: n, project_sheet_synced_at: new Date().toISOString() }).eq("id", r.id);
    const { data: gc } = await sb.from("google_connections").select("refresh_token").eq("user_id", r.user_id).maybeSingle();
    if (!gc?.refresh_token) { await note("Connect Gmail (with the sheet permission) to sync"); continue; }
    const token = await accessToken(gc.refresh_token); if (!token) { await note("Google connection expired; reconnect Gmail"); continue; }
    const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${r.project_sheet_id}?fields=sheets.properties.title`, { headers: { Authorization: `Bearer ${token}` } });
    if (!meta.ok) { await note(`Could not open the sheet (${meta.status}); check the link and the sheet permission`); continue; }
    const tabs: string[] = (((await meta.json()) as any).sheets || []).map((s: any) => s.properties?.title).filter(Boolean);
    const tab = tabs[0]; if (!tab) { await note("Sheet has no tabs"); continue; }
    const vr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${r.project_sheet_id}/values/${encodeURIComponent(tab)}?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } });
    const values: string[][] = vr.ok ? (((await vr.json()) as any).values || []) : [];
    if (values.length < 2) { await note("Sheet is empty"); continue; }
    const hdr = values[0].map((h) => String(h).toLowerCase().trim());
    const col = (re: RegExp, fb: number) => { const i = hdr.findIndex((h) => re.test(h)); return i >= 0 ? i : fb; };
    const c = { brand: col(/^brand/, 0), month: col(/month/, 1), deliv: col(/deliverable/, 2), stage: col(/stage/, 3), due: col(/due/, 4), live: col(/live/, 5), progress: col(/progress|status/, 6), rate: col(/^rate \(|^rate$|brand rate|gross/, 7), net: col(/rate to|net|payout/, 8), notes: col(/note/, 9) };
    let n = 0;
    for (const row of values.slice(1)) {
      const brand = String(row[c.brand] || "").trim(); if (!brand || brand.length > 80) continue;
      const month = String(row[c.month] || "").trim();
      const key = `${brand}|${month}`.toLowerCase();
      const liveText = String(row[c.live] || "").replace(/\s+/g, " ").trim();
      const notes = [liveText, String(row[c.notes] || "").trim()].filter((x) => x && !/HERE\.?$/i.test(x)).join(" · ").slice(0, 400) || null;
      const progress = String(row[c.progress] || "").trim(), stage = String(row[c.stage] || "").trim();
      const status = statusOf(progress, stage);
      const patch: any = { user_id: r.user_id, roster_creator_id: r.id, brand, title: month ? `${month.replace(/\s+$/, "")} ${/\d{4}/.test(month) ? "" : new Date().getFullYear()}`.trim() : null, deliverables: String(row[c.deliv] || "").trim() || null, status, due_at: toDate(String(row[c.due] || "")), go_live_at: toDate(liveText) , fee: money(String(row[c.net] || "")), brand_rate: money(String(row[c.rate] || "")), notes, source: "sheet", source_ref: key, updated_at: new Date().toISOString() };
      // keep dates a manager set by hand: only fill paid/invoiced dates when status says so and they're empty
      if (status === "paid") patch.paid_at_fill = true;
      const { data: existing } = await sb.from("projects").select("id,paid_at,invoice_sent_at,source").eq("roster_creator_id", r.id).or(`and(source.eq.sheet,source_ref.eq.${key.replace(/[,()]/g, "")}),and(brand.ilike.${brand.replace(/[,()]/g, "")},title.ilike.${(patch.title || "").replace(/[,()]/g, "")})`).limit(1).maybeSingle();
      delete patch.paid_at_fill;
      if (existing) {
        if (status === "paid" && !existing.paid_at) patch.paid_at = new Date().toISOString().slice(0, 10);
        if (status === "invoiced" && !existing.invoice_sent_at) patch.invoice_sent_at = new Date().toISOString().slice(0, 10);
        await sb.from("projects").update(patch).eq("id", existing.id);
      } else {
        if (status === "paid") patch.paid_at = patch.due_at; if (status === "invoiced") patch.invoice_sent_at = patch.due_at;
        await sb.from("projects").insert(patch);
      }
      n++;
    }
    total += n;
    await sb.from("roster_creators").update({ project_sheet_synced_at: new Date().toISOString(), project_sheet_note: `${n} projects synced ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` }).eq("id", r.id);
    log(r.name, "synced", n);
  }
  return total;
}
