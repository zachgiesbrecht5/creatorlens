// Worker-side observability: heartbeat every tick, alerts on failures (table +
// optional Slack/Discord webhook via ALERT_WEBHOOK_URL), and a nightly snapshot
// of row counts plus a JSON export of the core tables to the `backups` bucket.
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepWatch } from "./watch";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[observe]", ...a);

export async function heartbeat(sb: SupabaseClient, detail: Record<string, unknown> = {}) {
  await sb.from("heartbeats").upsert({ source: "worker", last_seen: new Date().toISOString(), detail }, { onConflict: "source" });
}

export async function alert(sb: SupabaseClient, message: string, detail: Record<string, unknown> = {}) {
  log("ALERT", message, JSON.stringify(detail).slice(0, 300));
  try { await sb.from("alerts").insert({ source: "worker", message, detail }); } catch { /* never throw from alerting */ }
  const url = process.env.ALERT_WEBHOOK_URL;
  if (url) fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `Sponsorprint worker: ${message}`, content: `Sponsorprint worker: ${message}` }) }).catch(() => {});
}

const CORE = ["creators", "brands", "partnerships", "contacts", "roster_creators", "profiles", "outreach_log", "drafts"] as const;

/** Once per UTC day: row counts into `snapshots`, JSON export into storage, alert if anything shrank >20%. */
export async function nightly(sb: SupabaseClient) {
  const day = new Date().toISOString().slice(0, 10);
  const { data: done } = await sb.from("snapshots").select("day").eq("day", day).maybeSingle();
  if (done) return false;
  const counts: Record<string, number> = {};
  for (const t of CORE) { const { count } = await sb.from(t).select("*", { count: "exact", head: true }); counts[t] = count || 0; }
  const { data: prev } = await sb.from("snapshots").select("counts").order("day", { ascending: false }).limit(1).maybeSingle();
  const drops: string[] = [];
  for (const t of CORE) { const was = Number(prev?.counts?.[t] || 0); if (was >= 20 && counts[t] < was * 0.8) drops.push(`${t} ${was} -> ${counts[t]}`); }
  if (drops.length) await alert(sb, "table shrank overnight", { drops });
  await sb.from("snapshots").insert({ day, counts });
  // export
  for (const t of ["brands", "contacts", "partnerships", "creators", "roster_creators"]) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(t).select("*").range(from, from + 999);
      if (error) { await alert(sb, `backup export failed: ${t}`, { error: error.message }); break; }
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const body = JSON.stringify(rows);
    const { error } = await sb.storage.from("backups").upload(`${day}/${t}.json`, new Blob([body], { type: "application/json" }), { upsert: true });
    if (error) await alert(sb, `backup upload failed: ${t}`, { error: error.message });
  }
  log("nightly snapshot", JSON.stringify(counts));
  try { await keepWatch(sb); } catch (e: any) { await alert(sb, "watchlist keeper failed", { error: String(e?.message || e).slice(0, 300) }); }
  return true;
}
