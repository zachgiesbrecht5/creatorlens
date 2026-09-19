import Link from "next/link";
import { redirect } from "next/navigation";
import { journeyState } from "@/lib/supabase";
import { SearchBox } from "@/components/SearchBox";
import { PrintReceipt } from "@/components/PrintReceipt";
import { Journey } from "@/components/Journey";
import { HiringStrip } from "@/components/HiringStrip";
import { SignalsStrip, type MatchRow } from "@/components/SignalsStrip";
import { BrandSearch } from "@/components/BrandSearch";
import { supabaseAdmin, currentAccess } from "@/lib/supabase";
import { fmt } from "@/lib/fmt";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile: user, admin: seesAll } = await currentAccess();
  const admin = supabaseAdmin();
  const [{ count: creators }, { count: brands }, { count: deals }] = await Promise.all([
    admin.from("creators").select("*", { count: "exact", head: true }),
    admin.from("brands").select("*", { count: "exact", head: true }),
    admin.from("partnerships").select("*", { count: "exact", head: true }),
  ]);
  if (user) admin.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id).then(() => {});
  // Real prints for the hero: recent creators with at least four brands. Brand
  // names and post dates are public; contacts are not shown here.
  const { data: heroCreators } = await admin.from("creators").select("id,handle,platform,followers,last_scanned_at").not("last_scanned_at", "is", null).order("last_scanned_at", { ascending: false }).limit(40);
  const fmtK = (n: number | null) => (!n ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
  const samples: { handle: string; platform: string; followers: string; lines: { brand: string; tag: string; when: string; deals: number; repeat?: boolean }[]; contact: string | null; href: string }[] = [];
  if (heroCreators?.length) {
    const { data: walls } = await admin.from("brand_wall").select("creator_id,brand,evidence,deals,last_seen,repeat_partner").in("creator_id", heroCreators.map((c) => c.id)).eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false);
    for (const c of heroCreators) {
      const rows = (walls || []).filter((w) => w.creator_id === c.id).sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen))).slice(0, 6);
      if (rows.length < 4) continue;
      samples.push({ handle: c.handle, platform: c.platform === "youtube" ? "YouTube" : "Instagram", followers: fmtK(c.followers), href: `/c/${c.platform}/${c.handle}`, contact: null,
        lines: rows.map((r) => ({ brand: r.brand, tag: String(r.evidence || "").replace(/\s+/g, " ").slice(0, 24), when: r.last_seen ? new Date(r.last_seen).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "", deals: Number(r.deals) || 1, repeat: !!r.repeat_partner })) });
      if (samples.length >= 6) break;
    }
  }
  // Brand-new account with no roster: the onboarding is the first page.
  if (user) {
    const { data: me } = await admin.from("profiles").select("onboarded_at").eq("id", user.id).single();
    if (!me?.onboarded_at) { const { count } = await admin.from("roster_creators").select("*", { count: "exact", head: true }).eq("user_id", user.id); if (!count) redirect("/start"); }
  }
  let watchNew = 0;
  if (user) { const { count } = await admin.from("watch_events").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("seen", false); watchNew = count || 0; }
  const journey = user ? await journeyState(user.id) : null;
  // Fresh off the printer: creators the discover agent picked and printed, public to everyone signed in.
  const { data: fresh } = await admin.from("creators").select("id,platform,handle,display_name,avatar_url,followers,category,discover_reason,discovered_at").eq("is_public", true).not("last_scanned_at", "is", null).order("discovered_at", { ascending: false }).limit(9);
  const freshIds = (fresh || []).map((f) => f.id);
  const { data: freshWalls } = freshIds.length ? await admin.from("brand_wall").select("creator_id,brand,deals").in("creator_id", freshIds).eq("is_junk", false).eq("is_self_brand", false) : { data: [] };
  const freshCards = (fresh || []).map((f) => { const w = (freshWalls || []).filter((x) => x.creator_id === f.id).sort((a, b) => Number(b.deals) - Number(a.deals)); return { ...f, brands: w.length, top: w.slice(0, 3).map((x) => x.brand) }; });
  // today's drop
  let dropCards: any[] = [];
  if (user) {
    const { data: drop } = await admin.from("drops").select("items").eq("user_id", user.id).eq("day", new Date().toISOString().slice(0, 10)).maybeSingle();
    const items = ((drop?.items || []) as { creator_id: string; reason: string }[]);
    if (items.length) {
      const { data: cs } = await admin.from("creators").select("id,platform,handle,display_name,avatar_url,followers").in("id", items.map((i) => i.creator_id));
      const { data: ws } = await admin.from("brand_wall").select("creator_id,brand,deals").in("creator_id", items.map((i) => i.creator_id)).eq("is_junk", false).eq("is_self_brand", false);
      dropCards = items.map((i) => { const c = (cs || []).find((x) => x.id === i.creator_id); if (!c) return null; const w = (ws || []).filter((x) => x.creator_id === c.id).sort((a, b) => Number(b.deals) - Number(a.deals)); return { ...c, reason: i.reason, brands: w.length, top: w.slice(0, 3).map((x) => x.brand) }; }).filter(Boolean);
    }
  }
  let sigMatches: MatchRow[] = [], sigGeneral: any[] = [];
  if (user) {
    const [{ data: sm }, { data: sg }] = await Promise.all([
      admin.from("signal_matches").select("id,reason,score,seen,roster_creators(name),signals(*)").eq("user_id", user.id).order("seen").order("score", { ascending: false }).limit(3),
      admin.from("signals").select("*").order("announced_at", { ascending: false, nullsFirst: false }).limit(3),
    ]);
    sigMatches = (sm || []).map((m: any) => ({ id: m.id, reason: m.reason, score: m.score, seen: m.seen, creator: m.roster_creators?.name || "creator", signal: m.signals }));
    sigGeneral = sg || [];
  }
  const { data: hiring } = user ? await admin.from("hiring_signals").select("id,company,brand_id,title,seniority,url,posted_at,found_at,closed_at,summary").order("found_at", { ascending: false }).limit(6) : { data: [] };
  // Recently scanned: the whole index for the house, only your own unlocks otherwise.
  let recent: { platform: string; handle: string; display_name: string | null; avatar_url: string | null; followers: number | null }[] = [];
  if (seesAll) {
    recent = (await admin.from("creators").select("platform,handle,display_name,avatar_url,followers").order("last_scanned_at", { ascending: false }).limit(12)).data || [];
  } else if (user) {
    const { data: mine } = await admin.from("creator_access").select("platform,handle").eq("user_id", user.id).order("created_at", { ascending: false }).limit(24);
    if (mine?.length) recent = ((await admin.from("creators").select("platform,handle,display_name,avatar_url,followers").in("handle", mine.map((m) => m.handle)).limit(12)).data || []);
  }

  return (
    <div>
      {/* Hero: the print is the product. Headline left, the machine on the right. */}
      <section className="hero -mx-6 -mt-10 px-6 pb-16 pt-14 md:pt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-12">
          <div className="md:col-span-6">
            <h1 className="h1 max-w-xl text-white">Pull a creator&apos;s sponsor print.</h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/70">
              Every brand that has paid them, the post that proves it, and the person to email. Twenty seconds from a handle to a pitch for your own talent.
            </p>
            <div className="mt-8 max-w-xl">
              <SearchBox signedIn={!!user} cta="Pull the print" />
            </div>
            <p className="mt-4 text-[13px] text-white/45">Public posts only, read through the official YouTube and Instagram APIs. Nothing is ever sent for you.</p>
          </div>
          <div className="md:col-span-6 md:pl-6">
            <PrintReceipt indexDeals={deals ?? 0} samples={samples} />
          </div>
        </div>
      </section>

      {watchNew > 0 && <Link href="/watchlist" className="mt-6 flex items-center justify-between rounded-lg border border-ok/30 bg-okSoft/60 px-4 py-3 text-[13px] hover:border-ok"><span><b>{watchNew}</b> creator{watchNew === 1 ? "" : "s"} on your watchlist picked up new brands this week</span><span className="num text-[11px] text-ok">see what's new →</span></Link>}
      {user && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="label">or look up a brand</div>
          <div className="w-full max-w-md"><BrandSearch placeholder="Type a brand: Samsung, LMNT, Rocket Mortgage…" /></div>
          <div className="num text-[11px] text-dim">who they book, how often, who to email</div>
        </div>
      )}
      {journey && <div className="mt-6"><Journey s={journey} compact /></div>}

      {user && dropCards.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between"><div><div className="label">This morning's drop</div><div className="text-[13px] text-muted">Three prints in your lane, picked overnight from your roster. Yours to open, free.</div></div><div className="num text-[11px] text-dim">{new Date().toLocaleDateString(undefined, { weekday: "long" })}</div></div>
          <div className="grid gap-3 md:grid-cols-3">
            {dropCards.map((f) => (
              <Link key={f.id} href={`/c/${f.platform}/${f.handle}`} className="card group border-fg/20 p-4 transition hover:border-fg">
                <div className="flex items-center gap-3">
                  {f.avatar_url ? <img src={f.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" /> : <div className="h-11 w-11 rounded-full bg-surface2" />}
                  <div className="min-w-0"><div className="truncate text-[14px] font-semibold tracking-tight group-hover:text-accent">{f.display_name || f.handle}</div><div className="num truncate text-[10.5px] text-muted">{f.platform === "youtube" ? "YouTube" : "Instagram"} · {f.followers ? (f.followers >= 1e6 ? `${(f.followers / 1e6).toFixed(1)}M` : f.followers >= 1e3 ? `${Math.round(f.followers / 1e3)}K` : f.followers) : ""}</div></div>
                  <div className="ml-auto text-right"><div className="text-[20px] font-semibold leading-none tracking-tight">{f.brands}</div><div className="num text-[9.5px] text-dim">brands</div></div>
                </div>
                {f.top.length > 0 && <div className="num mt-3 truncate text-[11px] text-muted">{f.top.join(" · ")}</div>}
                <div className="num mt-2 text-[10.5px] text-ok">{f.reason}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {user && <SignalsStrip matches={sigMatches} general={sigGeneral} />}
      {user && <HiringStrip signals={(hiring || []) as any} />}

      {user && freshCards.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <div><div className="label">Fresh off the printer</div><div className="text-[13px] text-muted">Creators the printer went looking for on its own, next to the rosters people have added. Free to open.</div></div>
            <div className="num text-[11px] text-dim">new every night</div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {freshCards.map((f) => (
              <Link key={f.id} href={`/c/${f.platform}/${f.handle}`} className="card group p-4 transition hover:border-fg">
                <div className="flex items-center gap-3">
                  {f.avatar_url ? <img src={f.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" /> : <div className="h-11 w-11 rounded-full bg-surface2" />}
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold tracking-tight group-hover:text-accent">{f.display_name || f.handle}</div>
                    <div className="num truncate text-[10.5px] text-muted">{f.platform === "youtube" ? "YouTube" : "Instagram"} · {f.followers ? (f.followers >= 1e6 ? `${(f.followers / 1e6).toFixed(1)}M` : f.followers >= 1e3 ? `${Math.round(f.followers / 1e3)}K` : f.followers) : ""}{f.category ? ` · ${f.category}` : ""}</div>
                  </div>
                  <div className="ml-auto text-right"><div className="text-[20px] font-semibold leading-none tracking-tight">{f.brands}</div><div className="num text-[9.5px] text-dim">brands</div></div>
                </div>
                {f.top.length > 0 && <div className="num mt-3 truncate text-[11px] text-muted">{f.top.join(" · ")}</div>}
                {f.discover_reason && <div className="mt-2 line-clamp-2 text-[11.5px] leading-snug text-dim">{f.discover_reason}</div>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {recent && recent.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="text-sm font-medium">{seesAll ? "Recently printed" : "Your prints"}</div>
            <div className="text-[12px] text-dim">tap one to open it</div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            {recent.map((c) => (
              <Link key={c.platform + c.handle} href={`/c/${c.platform}/${c.handle}`} className="card flex items-center gap-3 p-3 transition hover:border-fg">
                {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-surface2" />}
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{c.display_name || c.handle}</div>
                  <div className="num truncate text-[10px] text-dim">{c.platform === "youtube" ? "YT" : "IG"} · {fmt(c.followers)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* The journey is a real sequence, so a rail with three stops is honest here. */}
      <section className="mt-20">
        <h2 className="h2">From handle to pitch</h2>
        <div className="rail mt-8 grid gap-10 md:grid-cols-3">
          <Stop title="Type a handle" body="YouTube or Instagram. Up to two years of videos or the last hundred posts are read in about twenty seconds. If someone already pulled this print, it opens instantly and costs nothing." />
          <Stop title="Read the print" body="Every sponsor, gifted deal and affiliate, with the caption line that gave it away and a link to the post. Brands that came back are marked repeat, because a brand that books twice is the one to call." />
          <Stop title="Pitch your talent" body="Hover a brand for the right person. One click writes the email in your voice, for the creator you represent, using this brand's real creator history as the reason to say yes. It opens in your Gmail. You send it." />
        </div>
      </section>

      <section className="mt-24 grid items-start gap-10 md:grid-cols-12">
        <div className="md:col-span-5">
          <h2 className="h2">What comes out the other end</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
            The scanned creator is the evidence. The pitch is for someone on your roster. Your style guide sets the voice, your signature closes it, and the brand&apos;s own booking history is the argument.
          </p>
          <p className="mt-6 text-[12px] text-dim">Illustrative. Names, brand and figures are invented.</p>
        </div>
        <div className="md:col-span-7">
          <div className="border-l-2 border-line pl-6 text-[14.5px] leading-relaxed">
            <div className="num text-[11px] text-dim">To d.reyes@hearthline.co</div>
            <div className="num mb-5 text-[11px] text-dim">Subject: Priya Nair for Hearthline&apos;s holiday cookware push</div>
            <p>Hi Dana,</p>
            <p className="mt-4">You booked @thekitchenlab in August for the Dutch oven launch, so I think you already know the format that works: a real weeknight cook, product in hand, no studio. Priya Nair (@priyacooks, 312K on Instagram, 140K on YouTube) does exactly that, one-pot dinners for families, filmed in her own kitchen, with a save rate about three times the category average.</p>
            <p className="mt-4">For the holiday window she could do a two-part braise series built around your enameled line, with a swipe-up to your gift bundles. Her audience is 78% women 28 to 44, mostly US and Canada, the same profile that bought through her Le Petit Four collab last winter.</p>
            <p className="mt-4">Is there room in your Q4 plan for a creator like Priya? Happy to send her rate card and three concept options.</p>
            <p className="mt-4 text-muted">Best,<br />Jordan</p>
          </div>
        </div>
      </section>

      <section className="mt-24 flex flex-wrap items-center justify-between gap-6 border-t border-line pt-10">
        <div className="max-w-xl">
          <div className="text-lg font-semibold tracking-tight">Free while in beta.</div>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">Sign in with Google, get 5 prints and 3 drafts to start, and keep going at no charge if you tell us what worked. Paid plans are coming; beta users keep a founding discount for good.</p>
        </div>
        <div className="flex gap-2">{!user && <Link href="/login" className="btn-dark">Pull your first print</Link>}<Link href="/pricing" className="btn-ghost">See plans</Link></div>
      </section>
    </div>
  );
}

function Stop({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="rail-dot" />
      <h3 className="mt-4 text-[17px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}
