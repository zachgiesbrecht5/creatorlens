import Link from "next/link";
import { LaneHooks, LaneRoster } from "@/components/LaneHooks";
import { cleanLine } from "@/lib/clean-text";
import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { PrintTimeline, type TL } from "@/components/PrintTimeline";
import { LaneWall, type LaneBrand } from "@/components/LaneWall";
import { LocationField } from "@/components/LocationField";
import { Tour } from "@/components/Tour";
import { CREATOR_TOUR } from "@/components/tours";
import { laneDigest } from "@/lib/lane-digest";
import { laneLaunches } from "@/lib/launches";
import { LaunchList } from "@/components/LaunchList";
import { trackerStatuses } from "@/lib/tracker";
import { PortalPanel } from "@/components/PortalPanel";
import { WatchAdd } from "@/components/WatchAdd";

// A roster creator's page: who has paid them (their map), and the brands paying
// their lane that haven't paid them yet, each one click from a contact and a
// pitch written for this creator.
const fmtK = (n: number | null) => (!n ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export default async function RosterCreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await currentProfile();
  if (!profile) redirect(`/login?next=/creators/${id}`);
  const admin = supabaseAdmin();
  const { data: r } = await admin.from("roster_creators").select("*").eq("id", id).single();
  if (!r || (r.user_id !== profile.id && !(profile.org_id && r.org_id === profile.org_id) && profile.plan !== "admin")) redirect("/creators");
  const platform = r.platform === "youtube" ? "youtube" : "instagram";
  const handle = String(r.handle || "").replace(/^@/, "");

  // their own print, if they're in the index
  const { data: me } = handle ? await admin.from("creators").select("id,category,display_name,avatar_url,followers,last_scanned_at,handle,performance").eq("platform", platform).ilike("handle", handle).maybeSingle() : { data: null };
  let timeline: TL[] = []; let myBrands: { id: string; name: string; deals: number; last: string | null }[] = [];
  if (me) {
    const [{ data: wall }, { data: months }, { data: why }] = await Promise.all([
      admin.from("brand_wall_mv").select("brand_id,brand,category,deals,last_seen,repeat_partner").eq("creator_id", me.id).eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false).neq("best_label", "Low").order("last_seen", { ascending: false }),
      admin.from("partnerships").select("brand_id,published_at").eq("creator_id", me.id).neq("status", "rejected").not("published_at", "is", null).limit(1000),
      admin.from("deal_insights").select("brand_id,why,season").eq("creator_id", me.id),
    ]);
    const mb = new Map<string, Set<string>>(); for (const m of months || []) (mb.get(m.brand_id) || mb.set(m.brand_id, new Set()).get(m.brand_id)!).add(String(m.published_at).slice(0, 7));
    const wb = new Map((why || []).map((w) => [w.brand_id, w]));
    timeline = (wall || []).map((w) => ({ brand_id: w.brand_id, brand: w.brand, category: w.category, months: [...(mb.get(w.brand_id) || [])].sort(), why: wb.get(w.brand_id)?.why || null, season: wb.get(w.brand_id)?.season || null, repeat: !!w.repeat_partner, deals: Number(w.deals) }));
    myBrands = (wall || []).map((w) => ({ id: w.brand_id, name: w.brand, deals: Number(w.deals), last: w.last_seen }));
  }

  // the lane: brands paying other creators in this category, minus the ones who've paid this creator
  const lane = me?.category || null;
  const mine = new Set(myBrands.map((b) => b.id));
  let laneBrands: LaneBrand[] = [];
  if (lane) {
    const { data: rows } = await admin.from("brand_wall_mv").select("brand_id,brand,category,website,deals,last_seen,creator_id,creators!inner(id,handle,platform,display_name,avatar_url,followers,category)").eq("creators.category", lane).neq("creator_id", me?.id || "00000000-0000-0000-0000-000000000000").eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false).neq("best_label", "Low").limit(4000);
    const agg = new Map<string, any>();
    for (const x of (rows || []) as any[]) {
      if (mine.has(x.brand_id)) continue;
      const e = agg.get(x.brand_id) || agg.set(x.brand_id, { brand_id: x.brand_id, brand: x.brand, category: x.category, website: x.website, creators: [], deals: 0, last: null as string | null, contacts: 0, _c: new Map<string, any>() }).get(x.brand_id)!;
      e.deals += Number(x.deals) || 0;
      if (!e.last || String(x.last_seen) > String(e.last)) e.last = x.last_seen;
      if (x.creators && !e._c.has(x.creators.id)) e._c.set(x.creators.id, { id: x.creators.id, handle: x.creators.handle, platform: x.creators.platform, name: x.creators.display_name || x.creators.handle, avatar: x.creators.avatar_url, followers: x.creators.followers });
    }
    const ids = [...agg.keys()];
    const { data: contactCounts } = ids.length ? await admin.from("contacts").select("brand_id").in("brand_id", ids).eq("house_only", false) : { data: [] };
    const cc = new Map<string, number>(); for (const c of contactCounts || []) cc.set(c.brand_id, (cc.get(c.brand_id) || 0) + 1);
    laneBrands = ([...agg.values()] as any[]).map((e) => ({ ...e, creators: [...e._c.values()].sort((a, b) => (b.followers || 0) - (a.followers || 0)).slice(0, 4), contacts: cc.get(e.brand_id) || 0 })).filter((e) => e.creators.length >= 1).sort((a, b) => b.creators.length - a.creators.length || String(b.last).localeCompare(String(a.last))).slice(0, 60) as LaneBrand[];
  }

  const digest = await laneDigest(profile.id, r.id, 30);
  const [{ data: pProjects }, { data: pEvents }, { data: pExps }, { data: pReqs }] = await Promise.all([
    admin.from("projects").select("*").eq("roster_creator_id", r.id).order("created_at", { ascending: false }),
    admin.from("creator_events").select("*").eq("roster_creator_id", r.id).order("starts_at", { ascending: false }).limit(30),
    admin.from("experiments").select("*").eq("roster_creator_id", r.id).order("created_at", { ascending: false }),
    admin.from("requests").select("*").eq("roster_creator_id", r.id).order("created_at", { ascending: false }),
  ]);
  const launchesRaw = await laneLaunches(lane, mine);
  const tracker = await trackerStatuses(profile.id, [...laneBrands.map((b) => ({ id: b.brand_id, name: b.brand, website: b.website })), ...launchesRaw.map((l) => ({ id: l.brand_id, name: l.brand, website: l.website }))]);
  for (const b of laneBrands) b.tracker = tracker[b.brand_id] || null;
  const launches = launchesRaw.map((l) => ({ ...l, tracker: tracker[l.brand_id] || null }));
  const paidPlan = ["pro", "agency", "team", "admin"].includes(String(profile.plan));
  const fmtK2 = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-3 num text-[11px] text-dim"><Link href="/creators" className="hover:text-accent">← my creators</Link></div>
      <div className="cp-head">
        {(me?.avatar_url || r.avatar_url) ? <img src={me?.avatar_url || r.avatar_url} alt="" className="cp-avatar" /> : <div className="cp-avatar bg-surface2" />}
        <div className="min-w-0 flex-1">
          <div className="rc-head">{platform === "youtube" ? "YouTube" : "Instagram"} · @{handle}{lane ? ` · ${lane}` : ""}</div>
          <h1 className="h1">{r.name}</h1>
          <div className="num mt-1 text-[12px] text-muted">{fmtK(me?.followers || r.followers)} {platform === "youtube" ? "subscribers" : "followers"}{r.niche ? ` · ${r.niche}` : ""}{me?.last_scanned_at ? ` · printed ${new Date(me.last_scanned_at).toLocaleDateString()}` : ""}</div>
          {r.pitch_angle && <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-muted">{r.pitch_angle}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
            <span className="num text-muted">based in</span><LocationField id={r.id} initial={r.location} />
            <a href={`/api/portal/preview?as=${r.id}`} className="btn-ghost !py-1 !text-[12px]" title="See this creator's page exactly as they would, without their login">preview as {r.name.split(" ")[0]} →</a>
            {me ? <Link href={`/c/${platform}/${me.handle}`} className="btn-ghost !py-1 !text-[12px]">open the full print →</Link> : <span className="num text-[11px] text-muted"><span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> printing {r.name} now; refresh in a minute</span>}
          </div>
        </div>
        <div className="cp-stats"><div><b>{myBrands.length}</b><span>paid them</span></div><div><b>{laneBrands.length}</b><span>in the lane, not yet</span></div><div><b>{laneBrands.filter((b) => b.contacts > 0).length}</b><span>with a contact</span></div></div>
      </div>

      <Tour id="creator" steps={CREATOR_TOUR} />
      <PortalPanel rosterCreatorId={r.id} name={r.name.split(" ")[0]} enabled={!!r.portal_enabled} creatorEmail={r.creator_email || null} projects={(pProjects || []) as any} events={(pEvents || []) as any} experiments={pExps || []} sheetId={(r as any).project_sheet_id || null} sheetNote={(r as any).project_sheet_note || null} thesis={(r as any).thesis || null} />
      {(me as any)?.performance?.top?.length > 0 && (() => { const perf = (me as any).performance; const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n)); return (
        <section className="card mt-6 p-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><div><div className="label">What's performing</div><div className="text-[13px] text-muted">{perf.items} posts in the window · median {fmtN(perf.median)} {perf.metric_label}. Top posts vs the median, with the hook that carried them.</div></div><div className="num text-[11px] text-dim">{(perf.hooks || []).filter((h: any) => h.hook !== "Other").slice(0, 3).map((h: any) => `"${h.hook}" ×${h.count}`).join(" · ")}</div></div>
          <div className="grid gap-2 md:grid-cols-2">
            {perf.top.slice(0, 6).map((t: any) => (
              <a key={t.url} href={t.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-lg border border-line p-3 hover:border-fg">
                <div className="num w-20 flex-none text-right"><div className="text-[15px] font-semibold text-fg">{fmtN(t.metric)}</div><div className="text-[10px] text-ok">{perf.median >= 1000 ? (t.metric / perf.median).toFixed(1) + "x median" : `#${perf.top.indexOf(t) + 1} of ${perf.items}`}</div></div>
                <div className="min-w-0"><div className="truncate text-[13px] font-medium">"{cleanLine(t.spoken || t.on_video || t.on_screen || t.hook || t.title)}"</div>{(t.spoken || t.on_video || t.on_screen) && <div className="truncate text-[11.5px] text-muted">{t.spoken ? "said" : t.on_video ? "on video" : "on cover"}{t.spoken && (t.on_video || t.on_screen) ? ` · on screen: "${cleanLine(t.on_video || t.on_screen)}"` : ""} · caption: {cleanLine(t.hook || t.title)}</div>}<div className="num text-[10.5px] text-muted">{new Date(t.published_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })} · {t.kind}{t.sponsored ? " · sponsored" : ""}</div></div>
              </a>
            ))}
          </div>
          {perf.formats?.length > 0 && <div className="num mt-3 text-[11px] text-muted">by format: {perf.formats.map((f: any) => `${f.kind} ${f.count} posts, avg ${fmtN(f.avg)}`).join(" · ")}</div>}
        </section>); })()}
      {timeline.length > 0 && <div className="card mt-6 px-5 pb-3 pt-2" data-tour="map"><PrintTimeline items={timeline} /></div>}

      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div><div className="label">In the lane, last 30 days</div><h2 className="h2">What's working for creators like {r.name}</h2><p className="mt-1 text-[13px] text-muted">From the {digest.creators.length} creator{digest.creators.length === 1 ? "" : "s"} watched under {r.name}. Best posts relative to each creator's own median, recurring hooks, and brands they picked up. This feeds {r.name}'s monthly update.</p></div>
          <Link href={`/watchlist?for=${r.id}`} className="btn-ghost !py-1.5 !text-[12px]">manage the lane →</Link>
        </div>
        <div className="mb-4"><WatchAdd roster={[{ id: r.id, name: r.name }]} defaultFor={r.id} compact /></div>
        {!digest.creators.length ? (
          <div className="card p-6 text-[13px] text-muted">No one is watched under {r.name} yet. Open a neighbor's print, click watch, and pick {r.name}; their top posts and new sponsors will show here every week.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <div className="card divide-y divide-line">
              {digest.posts.length === 0 && <div className="p-5 text-[13px] text-muted">Nothing from the last 30 days yet; re-print the watched creators to refresh.</div>}
              {digest.posts.slice(0, 8).map((p) => (
                <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 p-3.5 hover:bg-surface2/60">
                  <div className="num w-16 flex-none text-right"><div className="text-[15px] font-semibold">{fmtK2(p.metric)}</div><div className="text-[10px] text-ok">{p.mult ? `${p.mult}x their median` : `#${p.rank}`}</div></div>
                  <div className="min-w-0"><div className="truncate text-[13px] font-medium">{p.on_screen ? p.on_screen : p.hook || p.title}</div>{p.on_screen && <div className="truncate text-[11.5px] text-muted">caption: {p.hook || p.title}</div>}<div className="num text-[10.5px] text-muted">{p.creator} · {new Date(p.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {p.kind}{p.sponsored ? " · sponsored" : ""}</div></div>
                </a>
              ))}
            </div>
            <div className="space-y-4">
              <LaneHooks openers={digest.openers} note={digest.note} />
              <LaneRoster creators={digest.creators} />
              <div className="card p-4"><div className="label mb-2">New sponsors in the lane</div>{digest.newBrands.length ? <ul className="space-y-1 text-[13px]">{digest.newBrands.slice(0, 8).map((b, i) => <li key={i} className="flex justify-between gap-3"><span>{b.brand_id ? <Link href={`/brands/${b.brand_id}`} className="font-medium hover:text-accent">{b.brand}</Link> : <span className="font-medium">{b.brand}</span>} <span className="text-muted">paid {b.creator}</span></span><span className="num text-[11px] text-muted">{new Date(b.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></li>)}</ul> : <div className="text-[12.5px] text-muted">None flagged in the last 30 days.</div>}</div>
            </div>
          </div>
        )}
      </section>

      {launches.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div><div className="label">Launches in the lane</div><h2 className="h2">{launches.filter((l) => l.status === "open").length} pitch window{launches.filter((l) => l.status === "open").length === 1 ? "" : "s"} open · {launches.length} launches in the last 75 days</h2><p className="mt-1 text-[13px] text-muted">Brands paying {lane} creators and what they just launched, with the second-wave window (4 to 8 weeks after the post) and the seasonal re-push month. Pitch inside the window with {r.name} and the launch in the first sentence.</p></div>
          </div>
          <LaunchList launches={paidPlan ? launches : launches.slice(0, 2)} roster={{ id: r.id, name: r.name, handle: r.handle, platform: r.platform, followers: r.followers }} locked={!paidPlan} />
          {!paidPlan && launches.length > 2 && <div className="mt-2 text-[12.5px] text-muted">{launches.length - 2} more launches in this lane on Pro. <Link href="/pricing?need=launches" className="text-accent hover:underline">See plans →</Link></div>}
        </section>
      )}

      <section className="mt-8" data-tour="lane">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div><div className="label">Missing opportunities</div><h2 className="h2">Brands paying {lane || "this lane"} creators, not {r.name} yet</h2><p className="mt-1 text-[13px] text-muted">Ranked by how many creators in the lane they book. Open one for the contact and a pitch written for {r.name}.</p></div>
        </div>
        {lane ? <LaneWall brands={laneBrands} roster={{ id: r.id, name: r.name, handle: r.handle, platform: r.platform, followers: r.followers }} /> : <div className="card p-6 text-[13px] text-muted">{me ? `${r.name} is printed but not classified yet; the lane appears once classification finishes (a minute or two).` : `${r.name}'s print is running; the lane and this list appear when it lands.`}</div>}
      </section>
    </div>
  );
}
