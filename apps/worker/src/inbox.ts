// Inbox watch (phase 2). Hourly, for managers who turned it on: read the last
// 48h of inbox threads (read-only), find campaign confirmations, scope/fee/date
// changes, invoice/payment notices and event invitations, extract the facts with
// the model, and park them in inbox_items as PENDING. Nothing reaches a creator
// until the manager approves it on /inbox.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordSpend, optionalBudgetOpen, noteModelError, cleanForModel } from "./spend";

const MODEL = process.env.ANTHROPIC_INBOX_MODEL || "claude-haiku-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[inbox]", ...a);
const HINT = /(confirm|approved|signed|contract|agreement|sow|brief|deliverable|invoice|payment|paid|remit|net 30|net 45|wire|go live|launch|event|invite|invitation|rsvp|dinner|press|shoot|usage|rate|budget|book|campaign|partnership|collab)/i;

async function accessToken(refreshToken: string): Promise<string | null> {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  return r.ok ? (((await r.json()) as any).access_token || null) : null;
}
const b64 = (s: string) => Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function bodyText(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return b64(payload.body.data);
  if (payload.mimeType === "text/html" && payload.body?.data) return b64(payload.body.data).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  for (const p of payload.parts || []) { const t = bodyText(p); if (t) return t; }
  return "";
}

export async function watchInboxes(sb: SupabaseClient): Promise<number> {
  if (!client) return 0;
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const { data: users } = await sb.from("profiles").select("id,email,full_name,inbox_watched_at").eq("inbox_watch", true).or(`inbox_watched_at.is.null,inbox_watched_at.lt.${hourAgo}`).limit(10);
  let total = 0;
  for (const u of users || []) {
    const { data: gc } = await sb.from("google_connections").select("refresh_token").eq("user_id", u.id).maybeSingle();
    if (!gc?.refresh_token) { await sb.from("profiles").update({ inbox_note: "Reconnect Gmail to grant the read-only inbox permission", inbox_watched_at: new Date().toISOString() }).eq("id", u.id); continue; }
    const token = await accessToken(gc.refresh_token);
    if (!token) { await sb.from("profiles").update({ inbox_note: "Google connection expired; reconnect Gmail", inbox_watched_at: new Date().toISOString() }).eq("id", u.id); continue; }
    const sinceSec = Math.floor((Date.now() - 2 * 864e5) / 1000);
    const lr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=80&q=${encodeURIComponent(`in:inbox after:${sinceSec} -category:promotions -category:social -from:me`)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!lr.ok) { const t = await lr.text(); await sb.from("profiles").update({ inbox_note: lr.status === 403 ? "Reconnect Gmail to grant the read-only inbox permission" : `Gmail error ${lr.status}`, inbox_watched_at: new Date().toISOString() }).eq("id", u.id); log(u.email, "list failed", lr.status, t.slice(0, 120)); continue; }
    const ids: { id: string; threadId: string }[] = (((await lr.json()) as any).messages || []);
    // roster for matching
    const { data: roster } = await sb.from("roster_creators").select("id,name,handle").eq("user_id", u.id);
    const { data: seen } = ids.length ? await sb.from("inbox_items").select("thread_id").eq("user_id", u.id).in("thread_id", ids.map((m) => m.threadId)) : { data: [] };
    const seenThreads = new Set((seen || []).map((s) => s.thread_id));
    const candidates: { id: string; threadId: string; subject: string; from: string; date: string; text: string }[] = [];
    for (const m of ids) {
      if (seenThreads.has(m.threadId) || candidates.some((c) => c.threadId === m.threadId)) continue;
      const mr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
      if (!mr.ok) continue;
      const msg: any = await mr.json();
      const h = (n: string) => (msg.payload?.headers || []).find((x: any) => x.name.toLowerCase() === n)?.value || "";
      const subject = h("subject"), from = h("from"), date = h("date");
      const text = (bodyText(msg.payload) || msg.snippet || "").replace(/\s+/g, " ").slice(0, 2500);
      if (!HINT.test(subject + " " + text)) continue;
      const mentionsCreator = (roster || []).some((r) => new RegExp(`\\b${r.name.split(" ")[0]}\\b`, "i").test(subject + " " + text) || (r.handle && text.toLowerCase().includes(String(r.handle).replace(/^@/, "").toLowerCase())));
      if (!mentionsCreator) continue;
      candidates.push({ id: m.id, threadId: m.threadId, subject, from, date, text });
    }
    if (!candidates.length) { await sb.from("profiles").update({ inbox_watched_at: new Date().toISOString(), inbox_note: `Checked ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}; nothing new` }).eq("id", u.id); continue; }
    if (!(await optionalBudgetOpen(sb))) { log("budget closed; inbox parse deferred"); continue; }
    try {
      const names = (roster || []).map((r) => `${r.name}${r.handle ? ` (@${String(r.handle).replace(/^@/, "")})` : ""}`).join(", ");
      const user = cleanForModel(`You read a talent manager's inbox for a creator agency. Roster: ${names}.\nFor each email decide whether it contains something a creator should see on their project page, and extract it. Kinds:\n- project: a brand CONFIRMS or books a campaign (not a pitch, not a negotiation in progress): brand, creator, deliverables, fee to the creator if stated (number), due_at (YYYY-MM-DD or null), go_live_at (or null), title (short campaign name).\n- project_update: an existing campaign changes (scope, dates, fee, approval, content live): brand, creator, what changed (summary), any new dates/fee.\n- payout: an invoice was sent/accepted or a payment was made/scheduled: brand, creator, amount, when (YYYY-MM-DD), status (invoiced|paid|scheduled).\n- event: an invitation or scheduled thing the creator attends (event, shoot, call, dinner, press day): title, starts_at (ISO), location, brand, rsvp_url, creator.\n- none: anything else, including pitches we sent, replies declining, newsletters.\nBe conservative: only 'project' when the email says it's confirmed/signed/booked. Never invent a fee or a date.\n\nEmails:\n${candidates.map((c, i) => `#${i + 1} From: ${c.from} | Date: ${c.date} | Subject: ${c.subject}\n${c.text.slice(0, 1800)}`).join("\n\n")}\n\nReply ONLY with JSON: {"items":[{"n":1,"kind":"project|project_update|payout|event|none","creator":"first name as in roster"|null,"brand":"..."|null,"summary":"one plain sentence","fields":{...}}]}`);
      const msg = await client.messages.create({ model: MODEL, max_tokens: 2500, temperature: 0, messages: [{ role: "user", content: user }] });
      recordSpend(sb, "inbox", MODEL, (msg as any).usage, u.id).catch(() => {});
      const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join(""); const m = text.match(/\{[\s\S]*\}/);
      const items: any[] = m ? JSON.parse(m[0]).items || [] : [];
      for (const it of items) {
        const c = candidates[it.n - 1]; if (!c || !it.kind || it.kind === "none") continue;
        const rc = (roster || []).find((r) => it.creator && r.name.toLowerCase().startsWith(String(it.creator).toLowerCase()));
        await sb.from("inbox_items").upsert({ user_id: u.id, thread_id: c.threadId, message_id: c.id, kind: it.kind, roster_creator_id: rc?.id || null, creator_guess: it.creator || null, brand: it.brand || null, payload: { ...(it.fields || {}), summary: it.summary }, subject: c.subject, from_email: c.from, snippet: c.text.slice(0, 300), gmail_url: `https://mail.google.com/mail/u/0/#inbox/${c.threadId}`, received_at: c.date ? new Date(c.date).toISOString() : new Date().toISOString() }, { onConflict: "user_id,thread_id,kind", ignoreDuplicates: true });
        total++;
      }
      // remember threads we judged as 'none' too, so they aren't re-parsed every hour
      for (const c of candidates) if (!items.some((it) => it.n === candidates.indexOf(c) + 1 && it.kind !== "none")) await sb.from("inbox_items").upsert({ user_id: u.id, thread_id: c.threadId, message_id: c.id, kind: "none", subject: c.subject, from_email: c.from, status: "dismissed", received_at: new Date().toISOString() }, { onConflict: "user_id,thread_id,kind", ignoreDuplicates: true });
      await sb.from("profiles").update({ inbox_watched_at: new Date().toISOString(), inbox_note: `Checked ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}; ${total} to review` }).eq("id", u.id);
    } catch (e: any) { noteModelError(e); log(u.email, "parse failed", String(e?.message || e).slice(0, 160)); await sb.from("profiles").update({ inbox_watched_at: new Date().toISOString() }).eq("id", u.id); }
  }
  if (total) log("queued", total, "items for review");
  return total;
}
