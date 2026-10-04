// Weekly pulse (phase 3). Every Monday, for each roster creator with the portal
// on (or the monthly update switched on), draft the four-section pulse from the
// plan: what we're seeing, worth testing, coming up, on our end. Lands as a draft
// in creator_updates (kind=weekly); the manager reviews and sends from /updates.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordSpend, optionalBudgetOpen, noteModelError, cleanForModel } from "./spend";

const MODEL = process.env.ANTHROPIC_UPDATES_MODEL || "claude-sonnet-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[pulse]", ...a);
const fmtK = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

export async function writeWeeklyPulses(sb: SupabaseClient, force = false): Promise<number> {
  if (!client) return 0;
  const now = new Date(); const day = now.getUTCDay();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((day + 6) % 7)));
  const weekKey = monday.toISOString().slice(0, 10);
  const weekAgo = new Date(monday.getTime() - 7 * 864e5).toISOString();
  const { data: roster } = await sb.from("roster_creators").select("*").or("portal_enabled.eq.true,monthly_update.eq.true");
  let n = 0;
  for (const r of roster || []) {
    const { data: done } = await sb.from("creator_updates").select("id").eq("roster_creator_id", r.id).eq("month", weekKey).eq("kind", "weekly").maybeSingle();
    if (done && !force) continue;
    if (!(await optionalBudgetOpen(sb))) { log("budget closed"); break; }
    const first = r.name.split(" ")[0];
    const { data: mgr } = await sb.from("profiles").select("full_name,signature").eq("id", r.user_id).single();
    // data
    const { data: me } = await sb.from("creators").select("id,category,performance").eq("platform", r.platform === "youtube" ? "youtube" : "instagram").ilike("handle", String(r.handle || "").replace(/^@/, "")).maybeSingle();
    const perf: any = me?.performance || null;
    const own = (perf?.top || []).filter((t: any) => String(t.published_at) >= weekAgo).slice(0, 3).map((t: any) => `${fmtK(t.metric)} ${perf.metric_label}: "${t.spoken || t.on_video || t.on_screen || t.hook}"`);
    const { data: watches } = await sb.from("watchlist").select("platform,handle").eq("roster_creator_id", r.id);
    const laneLines: string[] = []; const hookAgg = new Map<string, { count: number; sum: number }>();
    if (watches?.length) {
      const { data: lc } = await sb.from("creators").select("handle,display_name,performance").or(watches.map((w) => `and(platform.eq.${w.platform},handle.ilike.${w.handle})`).join(","));
      const picks: { line: string; score: number }[] = [];
      for (const c of lc || []) { const p = c.performance as any; if (!p?.top) continue; for (const t of p.top.slice(0, 4)) { if (String(t.published_at) < new Date(Date.now() - 21 * 864e5).toISOString()) continue; const mult = p.median >= 1000 ? t.metric / p.median : 0; picks.push({ line: `${c.display_name || c.handle}: "${t.spoken || t.on_video || t.on_screen || t.hook}" (${t.kind}, ${fmtK(t.metric)}${mult ? `, ${mult.toFixed(1)}x their median` : ""})`, score: mult || t.metric / 1e6 }); } for (const h of p.hooks || []) { if (h.hook === "Other") continue; const e = hookAgg.get(h.hook) || hookAgg.set(h.hook, { count: 0, sum: 0 }).get(h.hook)!; e.count += h.count; e.sum += h.avg * h.count; } }
      laneLines.push(...picks.sort((a, b) => b.score - a.score).slice(0, 5).map((p) => p.line));
    }
    const hookLine = [...hookAgg.entries()].sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count).slice(0, 3).map(([h, v]) => `"${h}" (${v.count} posts)`).join(", ");
    const { data: ideas } = await sb.from("experiments").select("idea,hook,why,status").eq("roster_creator_id", r.id).in("status", ["idea", "testing"]).order("created_at", { ascending: false }).limit(4);
    const { data: projects } = await sb.from("projects").select("brand,title,status,due_at,go_live_at,fee").eq("roster_creator_id", r.id).eq("visible", true).not("status", "in", "(paid,cancelled)").order("due_at", { ascending: true, nullsFirst: false }).limit(8);
    const { data: events } = await sb.from("creator_events").select("title,starts_at,location,brand").or(`roster_creator_id.eq.${r.id},roster_creator_id.is.null`).eq("user_id", r.user_id).gte("starts_at", new Date().toISOString()).lte("starts_at", new Date(Date.now() + 28 * 864e5).toISOString()).order("starts_at").limit(6);
    const sinceDate = weekAgo.slice(0, 10);
    const { data: pitched } = await sb.from("tracker_rows").select("brand,status").eq("user_id", r.user_id).eq("tab", "outreach").gte("date_sent", sinceDate).ilike("creator", `%${first}%`).limit(60);
    const pitchedBrands = [...new Set((pitched || []).map((p) => p.brand))];
    const { data: convo } = await sb.from("tracker_rows").select("brand,status").eq("user_id", r.user_id).eq("tab", "outreach").ilike("creator", `%${first}%`).or("status.ilike.%repl%,status.ilike.%interest%,status.ilike.%negot%,status.ilike.%call%").gte("date_sent", new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)).limit(10);
    const { data: reqs } = await sb.from("requests").select("text,status,reply").eq("roster_creator_id", r.id).neq("status", "done").limit(5);
    let launchLines: string[] = [];
    if (me?.category) {
      const { data: laneRows } = await sb.from("brand_wall").select("brand_id,creators!inner(category)").eq("creators.category", me.category).eq("is_junk", false).eq("is_mass_sponsor", false).limit(3000);
      const bids = [...new Set((laneRows || []).map((x: any) => x.brand_id))];
      if (bids.length) { const { data: ls } = await sb.from("launch_signals").select("kind,product,posted_at,spoken,on_video,window_start,window_end,brands(name)").in("brand_id", bids).gte("posted_at", new Date(Date.now() - 45 * 864e5).toISOString()).order("posted_at", { ascending: false }).limit(4); launchLines = ((ls || []) as any[]).map((l) => `${l.brands?.name}: ${l.kind}${l.product ? ` of ${l.product}` : ""} on ${String(l.posted_at).slice(0, 10)}${l.spoken || l.on_video ? ` (they said: "${(l.spoken || l.on_video).slice(0, 80)}")` : ""}; window ${d(l.window_start)} to ${d(l.window_end)}`); }
    }
    // seasonal moments in the next 6 weeks
    const season: string[] = []; const m = now.getUTCMonth() + 1;
    const cal: Record<number, string[]> = { 9: ["Halloween content lead time (shoot by mid Oct)", "Gift guides start pitching in October"], 10: ["Halloween (Oct 31)", "Gift season: brands lock creator lists by early Nov", "First snow / cozy season"], 11: ["Black Friday and Cyber Monday", "Holiday travel", "Christmas content"], 12: ["Christmas", "New Year / resolutions content", "January fitness and finance pushes"], 1: ["New Year resets", "Valentine's lead time"], 2: ["Valentine's", "Spring break planning"], 3: ["Spring", "Easter", "Mother's Day lead time"], 4: ["Mother's Day", "Graduation", "Summer travel pitching starts"], 5: ["Father's Day", "Summer", "Back to school lead time (July pitches)"], 6: ["Summer travel", "Back to school: brands brief in July"], 7: ["Back to school", "Fall previews"], 8: ["Back to school live", "Halloween lead time"] };
    season.push(...(cal[m] || []));

    const sys = `You write the Monday "weekly pulse" a talent manager sends to a creator they represent. Readable in 2 to 3 minutes. Plain, warm, specific, no hype, no em dashes, no bullet symbols other than a simple "-". Four short sections with these exact headings:

WHAT WE'RE SEEING
One or two real observations from the data provided (their own best post this week if any, what's working for creators in their lane, hook shapes). Name the creator and the hook. If there is no data, say honestly that the lane was quiet.

WORTH TESTING
Two or three ideas at most. Prefer the manager's listed ideas; otherwise derive from the lane data (a format or hook shape that is winning, applied to this creator). Each one line: the idea, then "why" in a few words. Frame as suggestions, never instructions; the creator keeps creative control.

COMING UP
Dates in the next few weeks: project due dates and go-lives, events, seasonal moments, and brand launch windows we are pitching into. Short lines.

ON OUR END
What the agency did for them this week and what is live: brands pitched (just the count and a few names), who is in conversation, project statuses, any open requests and where they stand. Make the invisible work visible, briefly.

Sign-off: first name only on a new line, then the sender's sign-off if given. Under 260 words. Output JSON: {"subject": string, "body": string}. Subject like "Pulse · week of <Mon DD>".`;
    const user = cleanForModel(`Creator: ${first} (${r.name}), ${r.platform}. Manager: ${mgr?.full_name || "your manager"}. Sign-off: ${mgr?.signature || "Best"}.
Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.

Their own top posts this week: ${own.join(" | ") || "(none captured)"}
Creators in their lane, best recent posts: ${laneLines.join(" | ") || "(none)"}
Hook shapes winning in the lane: ${hookLine || "(none)"}
Manager's ideas on file: ${(ideas || []).map((i) => `${i.idea}${i.hook ? ` (hook: "${i.hook}")` : ""}${i.why ? ` why: ${i.why}` : ""} [${i.status}]`).join(" | ") || "(none)"}
Live projects: ${(projects || []).map((p) => `${p.brand}${p.title ? ` ${p.title}` : ""}: ${p.status}${p.due_at ? `, due ${d(p.due_at)}` : ""}${p.go_live_at ? `, live ${d(p.go_live_at)}` : ""}`).join(" | ") || "(none)"}
Events next 4 weeks: ${(events || []).map((e) => `${e.title}${e.brand ? ` (${e.brand})` : ""} ${d(e.starts_at)}${e.location ? ` ${e.location}` : ""}`).join(" | ") || "(none)"}
Seasonal moments: ${season.join(" | ")}
Brand launches in their lane: ${launchLines.join(" | ") || "(none)"}
Pitched for them this week: ${pitchedBrands.length} brands${pitchedBrands.length ? ` (${pitchedBrands.slice(0, 6).join(", ")})` : ""}
In conversation: ${[...new Set((convo || []).map((c) => `${c.brand} (${c.status})`))].join(", ") || "(none)"}
Open requests from them: ${(reqs || []).map((q) => `"${q.text}" ${q.status}${q.reply ? ` (reply: ${q.reply})` : ""}`).join(" | ") || "(none)"}`);
    try {
      const msg = await client.messages.create({ model: MODEL, max_tokens: 1200, temperature: 0.4, system: sys, messages: [{ role: "user", content: user }] });
      recordSpend(sb, "pulse", MODEL, (msg as any).usage, r.id).catch(() => {});
      const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join(""); const mm = text.match(/\{[\s\S]*\}/);
      const j = mm ? JSON.parse(mm[0]) : null; if (!j?.body) continue;
      await sb.from("creator_updates").upsert({ user_id: r.user_id, roster_creator_id: r.id, month: weekKey, kind: "weekly", subject: j.subject || `Pulse · week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, body: String(j.body).replace(/[\u2013\u2014]/g, "-"), status: "draft" }, { onConflict: "roster_creator_id,month" });
      n++; log("drafted pulse for", r.name);
    } catch (e: any) { noteModelError(e); log("pulse failed", r.name, String(e?.message || e).slice(0, 120)); }
  }
  return n;
}
