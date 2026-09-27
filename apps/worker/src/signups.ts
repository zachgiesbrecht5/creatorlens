// New-signup notifier. Every tick, look for signup events the worker hasn't
// announced yet and post them to the alert webhook (Slack/Discord) and, if
// configured, email the admins from the house Gmail. Also recorded as a
// "signup" alert so /queue shows them even with no webhook.
import type { SupabaseClient } from "@supabase/supabase-js";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[signups]", ...a);
let lastSeen: string | null = null;

export async function announceSignups(sb: SupabaseClient) {
  if (!lastSeen) {
    const { data } = await sb.from("alerts").select("created_at").eq("source", "signup").order("created_at", { ascending: false }).limit(1).maybeSingle();
    lastSeen = data?.created_at || new Date(Date.now() - 3600e3).toISOString();
  }
  const { data: ev } = await sb.from("events").select("id,user_id,created_at").eq("name", "signup").gt("created_at", lastSeen).order("created_at").limit(20);
  if (!ev?.length) return 0;
  const ids = ev.map((e) => e.user_id).filter(Boolean);
  const { data: profiles } = await sb.from("profiles").select("id,email,full_name,plan,founding").in("id", ids);
  for (const e of ev) {
    const p = (profiles || []).find((x) => x.id === e.user_id);
    const who = `${p?.full_name || "someone"} <${p?.email || "?"}>`;
    const text = `New Sponsorprint signup: ${who} (${p?.plan || "trial"}${p?.founding ? ", founder" : ""})`;
    await sb.from("alerts").insert({ source: "signup", message: `New signup: ${p?.full_name || p?.email || "unknown"}`, detail: { email: p?.email, plan: p?.plan, founding: p?.founding }, acked: true }).then(() => {});
    const url = process.env.ALERT_WEBHOOK_URL;
    if (url) fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }) }).catch(() => {});
    log(text);
    lastSeen = e.created_at;
  }
  return ev.length;
}
