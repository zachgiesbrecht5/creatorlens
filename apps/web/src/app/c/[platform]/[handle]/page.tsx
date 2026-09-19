import Link from "next/link";
import { supabaseAdmin, currentUser, currentAccess, canSeeCreator } from "@/lib/supabase";
import { UnlockCreator } from "@/components/UnlockCreator";
import { PrinterMachine } from "@/components/PrinterMachine";
import type { TL } from "@/components/PrintTimeline";
import { Reprint } from "@/components/Reprint";
import { WatchButton } from "@/components/WatchButton";
import { NeighborsButton } from "@/components/NeighborsButton";
import { Tour } from "@/components/Tour";
import { PRINT_TOUR } from "@/components/tours";
import { ShareBar } from "@/components/ShareBar";
import { BrandWall, type WallCard, type RosterCreator } from "@/components/BrandWall";
import { PrintingScan } from "@/components/PrintingScan";
import { fmt } from "@/lib/fmt";

export const dynamic = "force-dynamic";

export default async function CreatorPage({ params, searchParams }: { params: Promise<{ platform: string; handle: string }>; searchParams: Promise<{ pitch?: string; from?: string }> }) {
  const { platform, handle } = await params;
  const sp = await searchParams;
  const user = await currentUser();
  const admin = supabaseAdmin();
  const p = platform === "instagram" ? "instagram" : "youtube";
  const h = decodeURIComponent(handle).replace(/^@/, "");

  const { data: creator } = await admin.from("creators").select("*").eq("platform", p).or(`handle.ilike.${h},external_id.eq.${h}`).maybeSingle();
  const { data: job } = await admin.from("scan_jobs").select("id,status,error,created_at").eq("platform", p).ilike("handle", h).order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!creator) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        {job && (job.status === "queued" || job.status === "running" || job.status === "rate_limited") ? (
          <PrintingScan jobId={job.id} initialStatus={job.status} handle={h} platform={p} />
        ) : job?.status === "failed" ? (
          <div className="card mt-8 border-bad/30 bg-badSoft p-6 text-sm text-bad">Scan failed: {job.error}. Your credit was refunded.</div>
        ) : (
          <p className="mt-6 text-muted"><span className="label mr-2">{p === "youtube" ? "YouTube" : "Instagram"} · @{h}</span> Not indexed yet. <Link href="/" className="text-accent underline-offset-2 hover:underline">Scan it from the home page.</Link></p>
        )}
      </div>
    );
  }

  const { admin: seesAll } = await currentAccess();
  const unlocked = await canSeeCreator(user?.id || null, seesAll, creator);
  const { data: wall } = await admin.from("brand_wall").select("*").eq("creator_id", creator.id).order("deals", { ascending: false }).order("best_score", { ascending: false });
  const cards = ((wall || []) as WallCard[]).filter((c) => !c.is_junk);
  const { data: watchRow } = user ? await admin.from("watchlist").select("handle").eq("user_id", user.id).eq("platform", p).eq("handle", creator.handle.toLowerCase()).maybeSingle() : { data: null };
  const watching = !!watchRow;
  // the map: every dated deal by brand, plus the "why then" lines
  const [{ data: dealMonths }, { data: insights }] = await Promise.all([
    admin.from("partnerships").select("brand_id,published_at").eq("creator_id", creator.id).neq("status", "rejected").not("published_at", "is", null).limit(1000),
    admin.from("deal_insights").select("brand_id,why,season").eq("creator_id", creator.id),
  ]);
  const whyBy = new Map((insights || []).map((i) => [i.brand_id, i]));
  const monthsBy = new Map<string, Set<string>>();
  for (const d of dealMonths || []) { const m = String(d.published_at).slice(0, 7); (monthsBy.get(d.brand_id) || monthsBy.set(d.brand_id, new Set()).get(d.brand_id)!).add(m); }
  const timeline: TL[] = cards.filter((c) => !c.is_self_brand && c.site_status !== "dead").map((c) => ({ brand_id: c.brand_id, brand: c.brand, category: c.category, months: [...(monthsBy.get(c.brand_id) || [])], why: whyBy.get(c.brand_id)?.why || null, season: whyBy.get(c.brand_id)?.season || null, repeat: !!c.repeat_partner, deals: Number(c.deals) }));
  const whyMap: Record<string, { why: string; season: string | null }> = Object.fromEntries((insights || []).map((i) => [i.brand_id, { why: i.why, season: i.season }]));
  const { data: roster } = user ? await admin.from("roster_creators").select("id,name,handle,platform,followers").eq("user_id", user.id).order("name") : { data: [] };
  const highMed = cards.filter((c) => c.best_label !== "Low");
  const repeat = highMed.filter((c) => c.repeat_partner).length;
  const active = job && ["queued", "running", "rate_limited"].includes(job.status);

  const header = (
    <>
      <div className="pw-top">
        <div className="pw-id">
          {creator.avatar_url ? <img src={creator.avatar_url} alt="" className="pw-avatar" /> : <div className="pw-avatar bg-surface2" />}
          <div className="min-w-0">
            <div className="rc-head" style={{ display: "flex", gap: 10 }}><span>{p === "youtube" ? "YouTube" : "Instagram"} · @{creator.handle}</span>{creator.category && creator.category !== "Other" && <Link href={`/brands?cat=${encodeURIComponent(creator.category)}`} className="hover:text-accent">{creator.category}</Link>}</div>
            <div className="pw-name truncate">{creator.display_name || creator.handle}</div>
            <div className="pw-meta">
              <a className="hover:text-accent" href={p === "youtube" ? `https://youtube.com/@${creator.handle}` : `https://instagram.com/${creator.handle}`} target="_blank" rel="noreferrer">open profile ↗</a>
              <span>{fmt(creator.followers)} {p === "youtube" ? "subscribers" : "followers"}</span>
              <span>printed {creator.last_scanned_at ? new Date(creator.last_scanned_at).toLocaleDateString() : "never"}</span>
            </div>
            {user && <ShareBar url={`${process.env.NEXT_PUBLIC_APP_URL || "https://sponsorprint.com"}/p/${p}/${creator.handle}`} name={creator.display_name || creator.handle} og={`/api/og/print?platform=${p}&handle=${encodeURIComponent(creator.handle)}`} />}
            {user && <div className="pw-actions" data-tour="actions">
              {!active && <Reprint platform={p} handle={creator.handle} />}
              <WatchButton platform={p} handle={creator.handle} initial={watching} />
              <NeighborsButton creatorId={creator.id} />
            </div>}
          </div>
        </div>
        <div className="pw-stats">
          <div><b>{highMed.length}</b>brands</div>
          <div><b>{highMed.reduce((s, c) => s + Number(c.deals), 0)}</b>deals</div>
          <div><b className={repeat > 0 ? "ok" : ""}>{repeat}</b>repeat 30d+</div>
        </div>
      </div>
      {creator.bio && <div className="pw-bio" title={creator.bio}>{creator.bio}</div>}
    </>
  );

  return (
    <div>
      {active && !cards.length ? (
        <PrintingScan jobId={job!.id} initialStatus={job!.status} handle={creator.handle} platform={p} />
      ) : !unlocked ? (
        <>
          <div className="pw-machine"><PrinterMachine lcd="LOCKED" /></div>
          <div className="pw" style={{ paddingBottom: 0 }}>{header}</div>
          <UnlockCreator platform={p} handle={creator.handle} signedIn={!!user} brands={highMed.length} />
        </>
      ) : (
        <>
          {active && <p className="num mb-2 text-center text-[11px] text-dim">re-printing in the background…</p>}
          {sp.from && <div className="mx-auto mb-3 max-w-5xl num text-[11px] text-dim"><Link href={sp.from} className="hover:text-accent">← back to {sp.from.startsWith("/n/") ? "the neighborhood" : "Start"}</Link></div>}
      {user && <Tour id="print" steps={PRINT_TOUR} />}
      <BrandWall header={header} timeline={timeline} why={whyMap} pitchFor={sp.pitch || null} cards={cards} creator={{ id: creator.id, handle: creator.handle, platform: p, displayName: creator.display_name || creator.handle }} signedIn={!!user} roster={(roster || []) as RosterCreator[]} />
        </>
      )}
    </div>
  );
}

