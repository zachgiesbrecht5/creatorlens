import { supabaseAdmin } from "@/lib/supabase";

/** Product event. Fire-and-forget; never throws. */
export function track(userId: string | null, name: string, props: Record<string, unknown> = {}) {
  supabaseAdmin().from("events").insert({ user_id: userId, name, props }).then(({ error }) => { if (error) console.warn("track failed", name, error.message); });
}

/** Something broke in the web app. Goes to the alerts table and, if set, a Slack/Discord webhook. */
export async function alert(message: string, detail: Record<string, unknown> = {}) {
  try { await supabaseAdmin().from("alerts").insert({ source: "web", message, detail }); } catch { /* never throw from alerting */ }
  const url = process.env.ALERT_WEBHOOK_URL;
  if (url) fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `Sponsorprint web: ${message}`, content: `Sponsorprint web: ${message}` }) }).catch(() => {});
}
