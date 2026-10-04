import Link from "next/link";
import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { laneDigest } from "@/lib/lane-digest";
import { laneLaunches } from "@/lib/launches";
import { parsePulse } from "@/lib/pulse-html";

// The creator's home: upcoming projects, payouts, hooks to test, top performers in
// their lane, what Rootfor is doing for them this week, and what's coming up.
const money = (n: number | null, c = "USD") => (n == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(n)));
const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const fmtK = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const STATUS: Record<string, string> = { confirmed: "confirmed", in_production: "in production", delivered: "delivered", invoiced: "invoiced", paid: "paid", cancelled: "cancelled" };

export default async function CreatorHome() {
  const { profile, roster: r, preview } = await requireCreator();
  const admin = supabaseAdmin();
  const first = r.name.split(" ")[0];
  const [{ data: projects }, { data: events }, { data: requests }, { data: experiments }, { data: me }] = await Promise.all([
    admin.from("projects").select("*").eq("roster_creator_id", r.id).eq("visible", true).neq("status", "cancelled").order("due_at", { ascending: true, nullsFirst: false }),
    admin.from("creator_events").select("*").or(`roster_creator_id.eq.${r.id},roster_creator_id.is.null`).eq("user_id", r.user_id).eq("visible", true).gte("starts_at", new Date(Date.now() - 864e5).toISOString()).order("starts_at").limit(8),
    admin.from("requests").select("*").eq("roster_creator_id", r.id).order("created_at", { ascending: false }).limit(5),
    admin.from("experiments").select("*").eq("roster_creator_id", r.id).in("status", ["idea", "testing"]).order("created_at", { ascending: false }).limit(6),
    admin.from("creators").select("id,category,performance,followers").eq("platform", r.platform === "youtube" ? "youtube" : "instagram").ilike("handle", String(r.handle || "").replace(/^@/, "")).maybeSingle(),
  ]);
  const { data: lastPulse } = await admin.from("creator_updates").select("subject,body,month,kind,sent_at").eq("roster_creator_id", r.id).eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle();
  const pulse = lastPulse ? parsePulse(lastPulse.body || "") : null;
  const upcoming = (projects || []).filter((p) => !["paid"].includes(p.status));
  const payouts = (projects || []).filter((p) => ["delivered", "invoiced", "paid"].includes(p.status) && p.fee != null);
  const digest = await laneDigest(r.user_id, r.id, 30);
  const lane = me?.category || null;
  const launches = (await laneLaunches(lane)).filter((l) => l.status === "open" || l.status === "soon").slice(0, 5);
  // what Rootfor is doing this week: pitches for this creator from the tracker (brand names only), last 7 days
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const { data: pitched } = await admin.from("tracker_rows").select("brand,date_sent,status").eq("user_id", r.user_id).eq("tab", "outreach").gte("date_sent", since).ilike("creator", `%${first}%`).order("date_sent", { ascending: false }).limit(40);
  const { data: inConvo } = await admin.from("tracker_rows").select("brand,date_sent,status").eq("user_id", r.user_id).eq("tab", "outreach").ilike("creator", `%${first}%`).or("status.ilike.%repl%,status.ilike.%interest%,status.ilike.%negot%,status.ilike.%call%").gte("date_sent", new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)).order("date_sent", { ascending: false }).limit(10);
  const uniqPitched = [...new Map((pitched || []).map((p) => [p.brand.toLowerCase(), p])).values()];
  const hooks = digest.posts.filter((p) => p.on_screen).slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl">
      {preview && <div className="mb-4 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-[12.5px]"><span>Previewing as <b>{r.name}</b>. This is exactly what they see; nothing here is visible to them until their portal is on.</span><a href="/api/portal/preview?clear=1" className="num text-[11px] text-accent hover:underline">end preview</a></div>}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div><div className="label mb-1">Sponsorprint · {r.name}</div><h1 className="h1">Hi {first}.</h1><p className="mt-1 text-[14px] text-muted">{upcoming.length ? `${upcoming.length} project${upcoming.length === 1 ? "" : "s"} on the go` : "No live projects right now"}{uniqPitched.length ? ` · ${uniqPitched.length} brands pitched for you this week` : ""}{launches.length ? ` · ${launches.length} launch window${launches.length === 1 ? "" : "s"} in your lane` : ""}.</p></div>
      </div>

      {pulse && pulse.sections.length > 0 && (
        <section className="card mb-5 p-5" style={{ borderLeft: "4px solid #2E1B5B" }}>
          <div className="mb-3 flex items-baseline justify-between"><div className="label">{lastPulse!.kind === "weekly" ? "This week's pulse" : "This month's update"}</div><div className="num text-[11px] text-muted">{new Date(lastPulse!.sent_at!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div></div>
          <div className="grid gap-4 md:grid-cols-2">{pulse.sections.map((sct) => (
            <div key={sct.title}><div className="num mb-1 text-[10.5px] tracking-[0.15em]" style={{ color: sct.title === "WORTH TESTING" ? "#E85D9B" : sct.title === "COMING UP" ? "#007D2A" : "#2E1B5B" }}>{sct.title}</div>
              <div className="space-y-1 text-[13px] leading-relaxed">{sct.lines.filter((l) => l.trim()).map((l, i) => <div key={i} className={/^[-•·*]\s/.test(l.trim()) ? "pl-3" : ""}>{l.trim().replace(/^[-•·*]\s+/, "· ")}</div>)}</div></div>
          ))}</div>
        </section>
      )}
      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <section className="card p-5">
            <div className="mb-3 flex items-baseline justify-between"><div className="label">Upcoming projects</div><Link href="/me/projects" className="num text-[11px] text-accent hover:underline">all projects →</Link></div>
            {!upcoming.length ? <p className="text-[13px] text-muted">Nothing confirmed yet. When a campaign is confirmed it appears here with the deliverables and dates.</p> : (
              <div className="divide-y divide-line">{upcoming.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0"><div className="text-[14px] font-semibold tracking-tight">{p.brand}{p.title ? <span className="font-normal text-muted"> · {p.title}</span> : null}</div>{p.deliverables && <div className="text-[12.5px] text-muted">{p.deliverables}</div>}<div className="num mt-0.5 text-[10.5px] text-dim">{p.due_at ? `due ${d(p.due_at)}` : ""}{p.go_live_at ? ` · live ${d(p.go_live_at)}` : ""}</div></div>
                  <span className={`pill-status ps-${p.status}`}>{STATUS[p.status] || p.status}</span>
                </div>))}</div>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-baseline justify-between"><div className="label">Hooks to test</div><Link href="/me/watchlist" className="num text-[11px] text-accent hover:underline">your lane →</Link></div>
            {!hooks.length ? <p className="text-[13px] text-muted">Hooks from creators in your lane appear here as their prints land. {digest.creators.length ? "" : "Add a few creators you rate to your watchlist to start."}</p> : (
              <div className="divide-y divide-line">{hooks.map((p) => (
                <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 py-2.5 hover:bg-surface2/60">
                  <div className="num w-14 flex-none text-right"><div className="text-[14px] font-semibold">{fmtK(p.metric)}</div><div className="text-[10px] text-ok">{p.mult ? `${p.mult}x` : `#${p.rank}`}</div></div>
                  <div className="min-w-0"><div className="text-[13.5px] font-medium">"{p.on_screen}"</div><div className="num text-[10.5px] text-muted">{p.creator} · {d(p.published_at)} · {p.kind}</div></div>
                </a>))}</div>
            )}
            {digest.hooks.length > 0 && <div className="num mt-3 text-[11px] text-muted">Shapes winning in your lane: {digest.hooks.slice(0, 3).map((h) => `"${h.hook}" (${h.count} posts, avg ${fmtK(h.avg)})`).join(" · ")}</div>}
          </section>

          <section className="card p-5">
            <div className="mb-3 label">Worth testing · ideas from your manager</div>
            {!experiments?.length ? <p className="text-[13px] text-muted">New ideas land here. You decide what to make.</p> : (
              <ul className="space-y-2">{experiments.map((e) => <li key={e.id} className="text-[13.5px]"><span className="font-medium">{e.idea}</span>{e.hook ? <span className="text-muted"> · hook: "{e.hook}"</span> : null}{e.why ? <div className="text-[12px] text-muted">{e.why}</div> : null}<span className={`pill ml-1 ${e.status === "testing" ? "!bg-accent/10 !text-accent" : ""}`}>{e.status}</span></li>)}</ul>
            )}
            <Link href="/me/experiments" className="num mt-3 inline-block text-[11px] text-accent hover:underline">experiments log →</Link>
          </section>
        </div>

        <div className="space-y-5">
          <section className="card p-5">
            <div className="mb-3 label">Payouts</div>
            {!payouts.length ? <p className="text-[13px] text-muted">Invoiced and paid campaigns show here.</p> : (
              <div className="divide-y divide-line">{payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><div className="truncate text-[13px] font-medium">{p.brand}</div><div className="num text-[10.5px] text-muted">{p.status === "paid" ? `paid ${d(p.paid_at)}` : p.status === "invoiced" ? `invoiced ${d(p.invoice_sent_at)}` : "delivered · invoice pending"}</div></div><div className={`num text-[13px] font-semibold ${p.status === "paid" ? "text-ok" : ""}`}>{money(p.fee, p.currency)}</div></div>))}</div>
            )}
            {payouts.length > 0 && <div className="num mt-3 flex justify-between border-t border-line pt-2 text-[11px] text-muted"><span>pending</span><span>{money(payouts.filter((p) => p.status !== "paid").reduce((s, p) => s + Number(p.fee || 0), 0))}</span></div>}
          </section>

          <section className="card p-5">
            <div className="mb-3 label">On our end this week</div>
            {!uniqPitched.length && !inConvo?.length ? <p className="text-[13px] text-muted">What we're pitching and who's talking shows here.</p> : (
              <div className="space-y-3 text-[13px]">
                {uniqPitched.length > 0 && <div><div className="num text-[10.5px] text-muted">pitched for you · {uniqPitched.length} brands</div><div className="mt-1 flex flex-wrap gap-1.5">{uniqPitched.slice(0, 14).map((p) => <span key={p.brand} className="pill">{p.brand}</span>)}{uniqPitched.length > 14 && <span className="num text-[11px] text-dim">+{uniqPitched.length - 14}</span>}</div></div>}
                {inConvo && inConvo.length > 0 && <div><div className="num text-[10.5px] text-muted">in conversation</div><ul className="mt-1 space-y-1">{[...new Map(inConvo.map((p) => [p.brand.toLowerCase(), p])).values()].map((p) => <li key={p.brand} className="flex justify-between gap-3"><span className="font-medium">{p.brand}</span><span className="num text-[11px] text-muted">{p.status}</span></li>)}</ul></div>}
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-3 label">Launches we're timing pitches to</div>
            {!launches.length ? <p className="text-[13px] text-muted">Brands in your lane that just launched something show here with the window we pitch in.</p> : (
              <ul className="space-y-2 text-[13px]">{launches.map((l) => <li key={l.id}><div className="font-medium">{l.brand}{l.product ? <span className="text-muted"> · {l.product}</span> : null}</div><div className="num text-[10.5px] text-muted">{l.status === "open" ? "pitching now" : `window opens ${d(l.window_start)}`}{l.spoken ? ` · they said: "${l.spoken.slice(0, 70)}"` : ""}</div></li>)}</ul>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-3 label">Coming up</div>
            {!events?.length ? <p className="text-[13px] text-muted">Events, shoots and seasonal moments show here.</p> : (
              <ul className="space-y-2 text-[13px]">{events.map((e) => <li key={e.id}><div className="font-medium">{e.title}{e.brand ? <span className="text-muted"> · {e.brand}</span> : null}</div><div className="num text-[10.5px] text-muted">{new Date(e.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{e.location ? ` · ${e.location}` : ""}{e.rsvp_url ? <> · <a href={e.rsvp_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">RSVP</a></> : null}</div></li>)}</ul>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-2 flex items-baseline justify-between"><div className="label">Ask us</div><Link href="/me/requests" className="num text-[11px] text-accent hover:underline">all requests →</Link></div>
            <p className="text-[12.5px] text-muted">Need an editor, a brand intro, a rate check? Post it and track it.</p>
            {requests && requests.length > 0 && <ul className="mt-2 space-y-1 text-[12.5px]">{requests.slice(0, 3).map((q) => <li key={q.id} className="flex justify-between gap-3"><span className="truncate">{q.text}</span><span className="num text-[10.5px] text-muted">{q.status.replace("_", " ")}</span></li>)}</ul>}
          </section>
        </div>
      </div>
    </div>
  );
}
