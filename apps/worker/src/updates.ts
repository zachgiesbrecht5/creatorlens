// Monthly creator updates. On the 1st, for every roster creator with the
// monthly update switched on, assemble last month from the outreach log
// (pitched / replied / negotiating / closed / dead per brand), lane activity
// (brands that started booking creators in the same category), and write a
// short draft in the manager's voice. The manager reviews and sends from the
// app; nothing goes out on its own.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordSpend, optionalBudgetOpen, cleanForModel } from "./spend";

const MODEL = process.env.ANTHROPIC_UPDATES_MODEL || "claude-sonnet-4-5";
const client = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "PASTE_ME" ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[updates]", ...a);

export async function writeCreatorUpdates(sb: SupabaseClient, force = false): Promise<number> {
  if (!client) return 0;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthKey = monthStart.toISOString().slice(0, 10);
  const label = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const { data: roster } = await sb.from("roster_creators").select("id,user_id,name,handle,platform,niche,update_show_money,update_show_early,creator_email").eq("monthly_update", true);
  let n = 0;
  for (const r of roster || []) {
    const { data: done } = await sb.from("creator_updates").select("id,status").eq("roster_creator_id", r.id).eq("month", monthKey).maybeSingle();
    if (done && !force) continue;
    const { data: profile } = await sb.from("profiles").select("full_name,pitch_style,email_signature").eq("id", r.user_id).single();
    const { data: log_ } = await sb.from("outreach_log").select("brand_id,contact_email,stage,deal_value,note,created_at,updated_at,brands(name)").eq("user_id", r.user_id).ilike("creator_handle", String(r.handle || "").replace(/^@/, "")).or(`created_at.gte.${monthStart.toISOString()},updated_at.gte.${monthStart.toISOString()}`).lt("created_at", monthEnd.toISOString());
    const rows = (log_ || []).map((l: any) => ({ brand: l.brands?.name || "a brand", stage: l.stage, value: r.update_show_money ? l.deal_value : null, note: l.note, when: String(l.updated_at || l.created_at).slice(0, 10) }));
    const shown = r.update_show_early ? rows : rows.filter((x) => x.stage !== "pitched" || true);   // pitched always shown; "early" hides nothing extra today
    // lane activity: brands that gained deals last month with creators in this category
    const { data: cat } = await sb.from("creators").select("category").eq("platform", r.platform === "youtube" ? "youtube" : "instagram").ilike("handle", String(r.handle || "").replace(/^@/, "")).maybeSingle();
    let lane: string[] = [];
    if (cat?.category) {
      const { data: lb } = await sb.from("partnerships").select("brand_id,brands(name),creators!inner(category)").gte("published_at", monthStart.toISOString()).lt("published_at", monthEnd.toISOString()).eq("creators.category", cat.category).limit(200);
      const counts = new Map<string, number>(); for (const p of (lb || []) as any[]) { const nme = p.brands?.name; if (nme) counts.set(nme, (counts.get(nme) || 0) + 1); }
      lane = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
    }
    // regional sponsorship signals matched to this creator
    const { data: sigm } = await sb.from("signal_matches").select("signals(brand,property,market,announced_at)").eq("roster_creator_id", r.id).gte("created_at", monthStart.toISOString()).limit(5);
    const sigLines = (sigm || []).map((m: any) => m.signals ? `${m.signals.brand} signed ${m.signals.property}${m.signals.market ? ` (${m.signals.market})` : ""}` : null).filter(Boolean) as string[];
    // what's working in their lane: the creators watched under them, best recent posts vs their own median, recurring hooks
    const { data: watches } = await sb.from("watchlist").select("platform,handle").eq("user_id", r.user_id).eq("roster_creator_id", r.id);
    const laneLines: string[] = []; const hookAgg = new Map<string, { count: number; sum: number }>();
    if (watches?.length) {
      const { data: lc } = await sb.from("creators").select("handle,display_name,performance").or(watches.map((w) => `and(platform.eq.${w.platform},handle.ilike.${w.handle})`).join(","));
      const picks: { line: string; score: number }[] = [];
      for (const c of lc || []) {
        const perf = c.performance as any; if (!perf?.top) continue;
        for (const t of (perf.top as any[]).slice(0, 5)) {
          if (String(t.published_at) < monthStart.toISOString()) continue;
          const mult = perf.median >= 1000 ? t.metric / perf.median : 0;
          const hook = t.spoken || t.on_video || t.on_screen || t.hook || String(t.title).slice(0, 80);
          picks.push({ line: `${c.display_name || c.handle}: "${hook}" (${t.kind}, ${Math.round(t.metric / 1000)}K ${perf.metric_label}${mult ? `, ${mult.toFixed(1)}x their median` : ""}${t.sponsored ? ", sponsored" : ""})`, score: mult || t.metric / 1e6 });
        }
        for (const h of (perf.hooks || []) as any[]) { if (h.hook === "Other") continue; const e = hookAgg.get(h.hook) || hookAgg.set(h.hook, { count: 0, sum: 0 }).get(h.hook)!; e.count += h.count; e.sum += h.avg * h.count; }
      }
      laneLines.push(...picks.sort((a, b) => b.score - a.score).slice(0, 4).map((p) => p.line));
    }
    // launches in the lane: open and upcoming windows, with what the brand said
    const laneCat: string | null = (r as any).lane || null;
    let launchLines: string[] = [];
    try {
      const { data: me } = await sb.from("creators").select("category").eq("platform", r.platform === "youtube" ? "youtube" : "instagram").ilike("handle", String(r.handle || "").replace(/^@/, "")).maybeSingle();
      const cat = me?.category || laneCat;
      if (cat) {
        const { data: laneRows } = await sb.from("brand_wall").select("brand_id,creators!inner(category)").eq("creators.category", cat).eq("is_junk", false).eq("is_mass_sponsor", false).limit(3000);
        const bids = [...new Set((laneRows || []).map((x: any) => x.brand_id))];
        if (bids.length) {
          const { data: ls } = await sb.from("launch_signals").select("kind,product,summary,posted_at,spoken,on_video,window_start,window_end,brands(name)").in("brand_id", bids).gte("posted_at", new Date(Date.now() - 60 * 864e5).toISOString()).order("posted_at", { ascending: false }).limit(5);
          launchLines = ((ls || []) as any[]).map((l) => `${l.brands?.name}: ${l.kind}${l.product ? ` of ${l.product}` : ""} on ${String(l.posted_at).slice(0, 10)}${l.spoken || l.on_video ? ` (they said: "${(l.spoken || l.on_video).slice(0, 90)}")` : ""}; pitch window ${l.window_start} to ${l.window_end}`);
        }
      }
    } catch { /* optional */ }
    const hookLine = [...hookAgg.entries()].sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count).slice(0, 3).map(([h, v]) => `"${h}" (${v.count} posts)`).join(", ");
    if (!shown.length && !lane.length && !sigLines.length && !laneLines.length && !force) { log("nothing to say for", r.name); continue; }
    const sys = `You write a short monthly update from a talent manager to a creator they represent, in the manager's voice. Plain text, warm, direct, no hype, no exclamation marks, no bullet points, under 160 words. If brand launches are provided, add a short "coming up" line or two: the launch, when the window opens, and that we are pitching it for them; no hype. If lane performance data is provided, add one short paragraph "what we're seeing in your lane" naming one or two specific posts/hooks from creators like them and one idea worth testing, phrased as a suggestion the creator can ignore, never as instruction. Structure: greeting with the creator's first name; one line naming the month; then short labelled lines only for sections that have content: "Pitched:", "In conversation:", "Closed:", "Passed:", "On the radar:" (brands starting to book creators in their lane). Include dollar amounts only where given. End with a one-line sign-off from the manager's first name, no signature block.${profile?.pitch_style ? `\nManager's style notes: ${String(profile.pitch_style).slice(0, 400)}` : ""}`;
    const user = `Manager: ${profile?.full_name || "the manager"}\nCreator: ${r.name} (@${r.handle})\nMonth: ${label}\n\nOutreach this month (brand · stage · value · note · date):\n${shown.map((x) => `${x.brand} · ${x.stage} · ${x.value != null ? "$" + Number(x.value).toLocaleString() : "-"} · ${x.note || "-"} · ${x.when}`).join("\n") || "(none)"}\n\nBrands that started booking creators in their lane this month: ${lane.join(", ") || "(none)"}\nSponsorship deals signed in their market this month (worth mentioning as "on the radar", we are pitching them): ${sigLines.join("; ") || "(none)"}\n\nWhat's working in their lane this month (creators like them, their best posts vs their own median; the quoted text is the hook):\n${laneLines.join("\n") || "(none)"}\nHook shapes performing in the lane: ${hookLine || "(none)"}\n\nBrand launches in their lane (what the brand just put out, and when the second-wave pitch window opens; we pitch inside the window):\n${launchLines.join("\n") || "(none)"}`;
    const msg = await client.messages.create({ model: MODEL, max_tokens: 700, temperature: 0.4, system: sys, messages: [{ role: "user", content: cleanForModel(user) }] });
    recordSpend(sb, "updates", MODEL, (msg as any).usage).catch(() => {});
    const body = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("").trim();
    const subject = `${label}: your update from ${profile?.full_name?.split(" ")[0] || "your manager"}`;
    await sb.from("creator_updates").upsert({ user_id: r.user_id, roster_creator_id: r.id, month: monthKey, subject, body, status: "draft" }, { onConflict: "roster_creator_id,month" });
    n++;
  }
  log("drafted", n);
  return n;
}
