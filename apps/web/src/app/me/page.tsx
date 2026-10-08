import Link from "next/link";
import { LaneHooks, LaneRoster } from "@/components/LaneHooks";
import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { laneDigest, laneTopPosts } from "@/lib/lane-digest";
import { LaneCards } from "@/components/LaneCards";
import { LaneBrief } from "@/components/LaneBrief";
import { IgConnectCard } from "@/components/IgConnectCard";
import { laneBrief, fitBand } from "@/lib/lane-brief";
import { cleanLine } from "@/lib/clean-text";
import { laneLaunches } from "@/lib/launches";
import { parsePulse } from "@/lib/pulse-html";

// The creator's home, built against the Jimmy call: (1) what's working, for them and in
// their lane, with the hooks; (2) what's worth testing, as suggestions; (3) what's coming
// up, seasonal and launches; (4) what the agency is doing for them. Business (projects,
// payouts) sits in a quiet rail. No creative instruction anywhere.
const money = (n: number | null, c = "USD") => (n == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(n)));
const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const fmtK = (n: number | null | undefined) => (!n ? "0" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const pct = (a: number | null | undefined, b: number | null | undefined) => (a && b ? ((a - b) / b) * 100 : null);
const STATUS: Record<string, string> = { confirmed: "confirmed", in_production: "in production", delivered: "delivered", invoiced: "invoiced", paid: "paid", cancelled: "cancelled" };
const SRC: Record<string, string> = { spoken: "said", on_video: "on video", on_screen: "on cover", hook: "caption" };

export default async function CreatorHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { roster: r, preview } = await requireCreator();
  const sp = await searchParams;
  const admin = supabaseAdmin();
  const first = r.name.split(" ")[0];
  const platform = r.platform === "youtube" ? "youtube" : "instagram";
  const [{ data: me }, { data: projects }, { data: events }, { data: ideas }, { data: lastPulse }] = await Promise.all([
    admin.from("creators").select("id,category,performance,followers,avatar_url,avatar_thumb,display_name,handle").eq("platform", platform).ilike("handle", String(r.handle || "").replace(/^@/, "")).maybeSingle(),
    admin.from("projects").select("*").eq("roster_creator_id", r.id).eq("visible", true).neq("status", "cancelled").order("due_at", { ascending: true, nullsFirst: false }),
    admin.from("creator_events").select("*").or(`roster_creator_id.eq.${r.id},roster_creator_id.is.null`).eq("user_id", r.user_id).eq("visible", true).gte("starts_at", new Date(Date.now() - 864e5).toISOString()).order("starts_at").limit(6),
    admin.from("experiments").select("*").eq("roster_creator_id", r.id).in("status", ["idea", "testing"]).order("created_at", { ascending: false }).limit(4),
    admin.from("creator_updates").select("subject,body,month,kind,sent_at").eq("roster_creator_id", r.id).eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const perf: any = me?.performance || null;
  const lane = me?.category || null;
  // owned insights (saves, shares, reach): present when this creator's Instagram sits in the manager's business portfolio
  const { data: owned } = me ? await admin.from("owned_post_insights").select("media_id,permalink,posted_at,media_type,caption,likes,comments,saves,shares,reach,views").eq("creator_id", me.id).order("posted_at", { ascending: false }).limit(50) : { data: [] as any[] };
  const hasOwned = !!owned?.length;
  const med = (arr: number[]) => { const a = arr.filter((n) => n != null && !isNaN(n)).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
  const medSaves = med((owned || []).map((o) => o.saves)), medShares = med((owned || []).map((o) => o.shares)), medReach = med((owned || []).map((o) => o.reach));
  const last30 = (owned || []).filter((o) => new Date(o.posted_at).getTime() > Date.now() - 30 * 864e5);
  const sumShares = last30.reduce((a, o) => a + (o.shares || 0), 0), sumSaves = last30.reduce((a, o) => a + (o.saves || 0), 0), sumReach = last30.reduce((a, o) => a + (o.reach || 0), 0);
  // "your best" by shares + saves when owned data exists (the numbers that drive discovery), else public engagement
  const ownBest = hasOwned ? [...(owned || [])].sort((a, b) => (b.shares || 0) + (b.saves || 0) - ((a.shares || 0) + (a.saves || 0))).slice(0, 4) : [];
  const hookFor = (permalink: string, caption: string) => { const t = (perf?.top || []).find((x: any) => x.url === permalink); return t ? { line: cleanLine(t.spoken || t.on_video || t.on_screen || t.hook), src: t.spoken ? "spoken" : t.on_video ? "on_video" : t.on_screen ? "on_screen" : "hook", thumb: t.thumb } : { line: cleanLine(String(caption || "").split(/\r?\n/).find((l) => l.trim()) || ""), src: "hook", thumb: null }; };
  // growth from scan history
  const { data: snaps } = me ? await admin.from("performance_snapshots").select("captured_at,followers,median").eq("creator_id", me.id).order("captured_at", { ascending: false }).limit(60) : { data: [] as any[] };
  const at = (days: number) => (snaps || []).find((s) => new Date(s.captured_at).getTime() <= Date.now() - days * 864e5 && s.followers);
  const g14 = pct(me?.followers, at(14)?.followers), g30 = pct(me?.followers, at(30)?.followers);
  const band = fitBand(me?.followers || r.followers);
  const digest = await laneDigest(r.user_id, r.id, 30, { fit: band });
  const [laneAll, laneTalking] = await Promise.all([laneTopPosts(digest.rowIds, { limit: 24, days: 60 }), laneTopPosts(digest.rowIds, { limit: 24, days: 60, voiceOnly: true })]);
  const brief = laneBrief(digest, laneAll, { performance: perf });
  const launches = lane ? (await laneLaunches(lane)).filter((l) => l.status === "open" || l.status === "soon").slice(0, 4) : [];
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const { data: pitched } = await admin.from("tracker_rows").select("brand").eq("user_id", r.user_id).eq("tab", "outreach").gte("date_sent", since).ilike("creator", `%${first}%`).limit(60);
  const { data: inConvo } = await admin.from("tracker_rows").select("brand,status").eq("user_id", r.user_id).eq("tab", "outreach").ilike("creator", `%${first}%`).or("status.ilike.%repl%,status.ilike.%interest%,status.ilike.%negot%,status.ilike.%call%").gte("date_sent", new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)).limit(10);
  const pitchedBrands = [...new Set((pitched || []).map((p) => p.brand))];
  const convo = [...new Map((inConvo || []).map((p) => [p.brand.toLowerCase(), p])).values()];
  const live = (projects || []).filter((p) => !["paid"].includes(p.status));
  const payable = (projects || []).filter((p) => ["delivered", "invoiced"].includes(p.status));
  const pending = payable.reduce((s, p) => s + Number(p.fee || 0), 0);
  const month = new Date().toISOString().slice(0, 7);
  const paidThisMonth = (projects || []).filter((p) => p.status === "paid" && String(p.paid_at || "").startsWith(month)).reduce((s, p) => s + Number(p.fee || 0), 0);
  const avatar = me?.avatar_thumb ? `data:image/jpeg;base64,${me.avatar_thumb}` : me?.avatar_url || r.avatar_url || null;
  const own = (perf?.top || []).slice(0, 4);
  const pulse = lastPulse ? parsePulse(lastPulse.body || "") : null;
  // the lane feed: thumbnails + hooks, source-tagged

  return (
    <div className="mx-auto max-w-6xl">
      {preview && <div className="mb-4 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-[12.5px]"><span>Previewing as <b>{r.name}</b>. Nothing here is visible to them until their portal is on.</span><a href="/api/portal/preview?clear=1" className="num text-[11px] text-accent hover:underline">end preview</a></div>}

      {/* the creator's own Instagram connection, when they have a login of their own (preview shows the manager's) */}
      {r.creator_user_id && !preview && <IgConnectCard userId={r.creator_user_id} next="/me" who="creator" status={sp.ig} />}

      {/* hero */}
      <section className="hero-card">
        <div className="flex flex-wrap items-center gap-5">
          {avatar ? <img src={avatar} alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-white/10" /> : <span className="inline-block h-20 w-20 rounded-full bg-white/10" />}
          <div className="min-w-0 flex-1">
            <div className="num text-[11px] tracking-[0.2em] text-white/50">ROOTFOR · {platform === "youtube" ? "YOUTUBE" : "INSTAGRAM"}{lane ? ` · ${lane.toUpperCase()}` : ""}</div>
            <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight text-white">{r.name}</h1>
            <div className="num mt-1 text-[12px] text-white/60">@{String(r.handle || "").replace(/^@/, "")}{(r as any).refreshed_at ? ` · profile as of ${new Date((r as any).refreshed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat href="/me/followers" label={platform === "youtube" ? "subscribers" : "followers"} value={fmtK(me?.followers || r.followers)} sub={g30 != null ? `${g30 >= 0 ? "+" : ""}${g30.toFixed(1)}% in 30d` : g14 != null ? `${g14 >= 0 ? "+" : ""}${g14.toFixed(1)}% in 14d` : "tracking from today"} good={(g30 ?? g14 ?? 0) >= 0} />
            {hasOwned ? <>
              <Stat href="/me/engagement" label="shares · 30 days" value={fmtK(sumShares)} sub={`median ${fmtK(medShares)} per post`} />
              <Stat href="/me/engagement" label="saves · 30 days" value={fmtK(sumSaves)} sub={`median ${fmtK(medSaves)} per post`} />
              <Stat href="/me/engagement" label="reach · 30 days" value={fmtK(sumReach)} sub={`median ${fmtK(medReach)} per post`} />
            </> : <>
              <Stat href="/me/engagement" label={`median ${perf?.metric_label || "engagement"}`} value={fmtK(perf?.median)} sub={perf ? `${perf.items} posts in window` : ""} />
              <Stat href="/me/projects" label="live projects" value={String(live.length)} sub={pending ? `${money(pending)} pending` : "nothing pending"} />
              <Stat href="/me/pitched" label="pitched this week" value={String(pitchedBrands.length)} sub={convo.length ? `${convo.length} in conversation` : "by your team"} />
            </>}
          </div>
        </div>
        {(r as any).thesis && <div className="mt-5 border-t border-white/10 pt-4 text-[14px] leading-relaxed text-white/85"><span className="num mr-2 text-[10.5px] tracking-[0.15em] text-white/50">WHERE WE'RE TAKING THIS</span>{(r as any).thesis}</div>}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          {/* your best */}
          {hasOwned ? (
            <section>
              <div className="mb-3 flex items-end justify-between"><div><div className="label">Your best right now · by shares and saves</div><h2 className="h2">What's carrying your numbers</h2><p className="mt-1 text-[13px] text-muted">Read from your own account. Shares and saves are what the algorithm pays for; these are your posts that earned the most of both.</p></div><Link href={`/c/${platform}/${String(r.handle || "").replace(/^@/, "")}`} className="num text-[11px] text-accent hover:underline">full print →</Link></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{ownBest.map((o) => { const h = hookFor(o.permalink, o.caption); return (
                <a key={o.media_id} href={o.permalink} target="_blank" rel="noreferrer" className="post-card">
                  {h.thumb ? <img src={`data:image/jpeg;base64,${h.thumb}`} alt="" className="post-thumb" /> : <div className="post-thumb bg-surface2" />}
                  <div className="p-3">
                    <div className="grid grid-cols-3 gap-1 text-center"><div><div className="num text-[14px] font-bold">{fmtK(o.shares)}</div><div className="num text-[9px] uppercase tracking-wide text-muted">shares</div></div><div><div className="num text-[14px] font-bold">{fmtK(o.saves)}</div><div className="num text-[9px] uppercase tracking-wide text-muted">saves</div></div><div><div className="num text-[14px] font-bold">{fmtK(o.reach)}</div><div className="num text-[9px] uppercase tracking-wide text-muted">reach</div></div></div>
                    <div className="mt-2 line-clamp-2 text-[12.5px] font-medium leading-snug">"{h.line}"</div>
                    <div className="mt-1.5 flex items-center gap-1.5"><span className="pill-src">{SRC[h.src]}</span><span className="num text-[10px] text-muted">{d(o.posted_at)}{medShares ? ` · ${((o.shares || 0) / Math.max(medShares, 1)).toFixed(1)}x your median shares` : ""}</span></div>
                  </div>
                </a>); })}</div>
            </section>
          ) : own.length > 0 && (
            <section>
              <div className="mb-3 flex items-end justify-between"><div><div className="label">Your best right now</div><h2 className="h2">What's carrying your numbers</h2></div><Link href={`/c/${platform}/${String(r.handle || "").replace(/^@/, "")}`} className="num text-[11px] text-accent hover:underline">full print →</Link></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{own.map((t: any, i: number) => <PostCard key={t.url} t={t} median={perf.median} label={perf.metric_label} rank={i + 1} items={perf.items} />)}</div>
            </section>
          )}

          {/* lane feed */}
          <section>
            <div className="mb-3 flex items-end justify-between gap-4"><div><div className="label">Your lane · what to do with it</div><h2 className="h2">What {digest.creators.length} creator{digest.creators.length === 1 ? "" : "s"} like you are being rewarded for</h2><p className="mt-1 text-[13px] text-muted">Counted from the people you and your team follow, each post against its own creator's median. First the direction, then the proof.</p></div><Link href="/me/watchlist" className="btn-ghost !py-1.5 !text-[12px] whitespace-nowrap">your lane →</Link></div>
            <LaneBrief brief={brief} first={first} laneSize={digest.creators.length} />
            <div className="mt-6"><LaneCards all={laneAll} talking={laneTalking} printHref fit={band} limit={8} title="The proof · last 60 days" /></div>
            <LaneHooks openers={digest.openers} note={digest.note} />
            <LaneRoster creators={digest.creators} you={{ followers: me?.followers || r.followers || null, growth30: g30 != null ? g30 / 100 : g14 != null ? g14 / 100 : null, median: perf?.median ?? null }} />
          </section>

          {/* worth testing */}
          <section>
            <div className="mb-3"><div className="label">Worth testing</div><h2 className="h2">Ideas, not instructions</h2><p className="mt-1 text-[13px] text-muted">Each one comes with the reason behind it. You decide what to make.</p></div>
            {!ideas?.length ? <div className="card p-5 text-[13.5px] text-muted">New ideas from your manager land here, tied to what the lane is doing.</div> : (
              <div className="grid gap-3 sm:grid-cols-2">{ideas.map((e) => <div key={e.id} className="card p-4" style={{ borderTop: "3px solid #E85D9B" }}><div className="text-[14px] font-semibold leading-snug">{e.idea}</div>{e.hook && <div className="mt-1 text-[13px]">hook: "{e.hook}"</div>}{e.why && <div className="mt-1.5 text-[12.5px] text-muted">why: {e.why}</div>}{e.status === "testing" && <span className="pill mt-2 !bg-accent/10 !text-accent">you're testing this</span>}</div>)}</div>
            )}
          </section>

          {pulse && pulse.sections.length > 0 && (
            <section className="card p-5" style={{ borderLeft: "4px solid #2E1B5B" }}>
              <div className="mb-3 flex items-baseline justify-between"><div className="label">{lastPulse!.kind === "weekly" ? "Last week's pulse" : "Last month's update"}</div><div className="num text-[11px] text-muted">{d(lastPulse!.sent_at)}</div></div>
              <div className="grid gap-4 md:grid-cols-2">{pulse.sections.map((sct) => <div key={sct.title}><div className="num mb-1 text-[10.5px] tracking-[0.15em]" style={{ color: sct.title === "WORTH TESTING" ? "#E85D9B" : sct.title === "COMING UP" ? "#007D2A" : "#2E1B5B" }}>{sct.title}</div><div className="space-y-1 text-[13px] leading-relaxed">{sct.lines.filter((l) => l.trim()).map((l, i) => <div key={i}>{l.trim().replace(/^[-•·*]\s+/, "· ")}</div>)}</div></div>)}</div>
            </section>
          )}
        </div>

        {/* rail */}
        <aside className="space-y-4">
          <section className="card p-5">
            <div className="mb-3 flex items-baseline justify-between"><div className="label">Projects</div><Link href="/me/projects" className="num text-[11px] text-accent hover:underline">all →</Link></div>
            {!live.length ? <p className="text-[13px] text-muted">Nothing live right now.</p> : <div className="divide-y divide-line">{live.slice(0, 6).map((p) => <div key={p.id} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><div className="truncate text-[13.5px] font-medium">{p.brand}</div><div className="num text-[10.5px] text-muted">{p.deliverables ? p.deliverables.slice(0, 40) : ""}{p.due_at ? ` · due ${d(p.due_at)}` : ""}</div></div><span className={`pill-status ps-${p.status}`}>{STATUS[p.status] || p.status}</span></div>)}</div>}
            <div className="num mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-[11px]"><div><div className="text-muted">pending payouts</div><div className="text-[15px] font-semibold text-fg">{money(pending)}</div></div><div><div className="text-muted">paid this month</div><div className="text-[15px] font-semibold text-ok">{money(paidThisMonth)}</div></div></div>
          </section>

          <section className="card p-5">
            <div className="mb-2 label">On our end this week</div>
            {!pitchedBrands.length && !convo.length ? <p className="text-[13px] text-muted">What we're pitching and who's talking shows here.</p> : (
              <div className="space-y-3 text-[13px]">
                {pitchedBrands.length > 0 && <div><div className="num text-[10.5px] text-muted">pitched for you · {pitchedBrands.length} brands</div><div className="mt-1 flex flex-wrap gap-1.5">{pitchedBrands.slice(0, 12).map((b) => <span key={b} className="pill">{b}</span>)}{pitchedBrands.length > 12 && <span className="num text-[11px] text-dim">+{pitchedBrands.length - 12}</span>}</div></div>}
                {convo.length > 0 && <div><div className="num text-[10.5px] text-muted">in conversation</div><ul className="mt-1 space-y-1">{convo.map((p) => <li key={p.brand} className="flex justify-between gap-3"><span className="font-medium">{p.brand}</span><span className="num text-[11px] text-muted">{p.status}</span></li>)}</ul></div>}
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-2 label">Coming up</div>
            <ul className="space-y-2 text-[13px]">
              {(events || []).map((e) => <li key={e.id}><div className="font-medium">{e.title}{e.brand ? <span className="text-muted"> · {e.brand}</span> : null}</div><div className="num text-[10.5px] text-muted">{new Date(e.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{e.location ? ` · ${e.location}` : ""}{e.rsvp_url ? <> · <a href={e.rsvp_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">RSVP</a></> : null}</div></li>)}
              {launches.map((l) => <li key={l.id}><div className="font-medium">{l.brand}{l.product ? <span className="text-muted"> · {l.product}</span> : null}</div><div className="num text-[10.5px] text-muted">{l.status === "open" ? "we're pitching this now" : `pitch window opens ${d(l.window_start)}`}{l.spoken ? ` · "${l.spoken.slice(0, 60)}"` : ""}</div></li>)}
              {!events?.length && !launches.length && <li className="text-muted">Events, shoots, seasonal moments and launch windows show here.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, good = true, href }: { label: string; value: string; sub?: string; good?: boolean; href?: string }) {
  const body = <><div className="num text-[10px] uppercase tracking-[0.12em] text-white/50">{label}{href && <span className="float-right text-white/30">→</span>}</div><div className="mt-0.5 text-[22px] font-bold leading-none text-white">{value}</div>{sub && <div className={`num mt-1 text-[10.5px] ${good ? "text-emerald-300" : "text-rose-300"}`}>{sub}</div>}</>;
  return href ? <Link href={href} className="block rounded-xl bg-white/[0.07] px-3.5 py-3 transition hover:bg-white/[0.13]" title="Open">{body}</Link> : <div className="rounded-xl bg-white/[0.07] px-3.5 py-3">{body}</div>;
}
function PostCard({ t, median, label, rank, items }: { t: any; median: number; label: string; rank: number; items: number }) {
  const src = t.spoken ? "spoken" : t.on_video ? "on_video" : t.on_screen ? "on_screen" : "hook";
  const line = cleanLine(t.spoken || t.on_video || t.on_screen || t.hook || t.title);
  return (
    <a href={t.url} target="_blank" rel="noreferrer" className="post-card">
      {t.thumb ? <img src={`data:image/jpeg;base64,${t.thumb}`} alt="" className="post-thumb" /> : <div className="post-thumb bg-surface2" />}
      <div className="p-3">
        <div className="flex items-baseline justify-between"><span className="num text-[15px] font-bold">{fmtK(t.metric)}</span><span className="num text-[10px] text-ok">{median >= 1000 ? `${(t.metric / median).toFixed(1)}x` : `#${rank} of ${items}`}</span></div>
        <div className="mt-1 line-clamp-2 text-[12.5px] font-medium leading-snug">"{line}"</div>
        <div className="mt-1.5 flex items-center gap-1.5"><span className="pill-src">{SRC[src]}</span><span className="num text-[10px] text-muted">{d(t.published_at)}</span></div>
      </div>
    </a>
  );
}
