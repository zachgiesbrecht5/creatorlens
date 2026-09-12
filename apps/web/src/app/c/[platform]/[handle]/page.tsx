import Link from "next/link";
import { supabaseAdmin, currentUser, currentAccess, canSeeCreator } from "@/lib/supabase";
import { UnlockCreator } from "@/components/UnlockCreator";
import { PrinterMachine } from "@/components/PrinterMachine";
import { BrandWall, type WallCard, type RosterCreator } from "@/components/BrandWall";
import { PrintingScan } from "@/components/PrintingScan";
import { fmt } from "@/lib/fmt";

export const dynamic = "force-dynamic";

export default async function CreatorPage({ params }: { params: Promise<{ platform: string; handle: string }> }) {
  const { platform, handle } = await params;
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

  const { insider } = await currentAccess();
  const unlocked = await canSeeCreator(user?.id || null, insider, creator);
  const { data: wall } = await admin.from("brand_wall").select("*").eq("creator_id", creator.id).order("deals", { ascending: false }).order("best_score", { ascending: false });
  const cards = ((wall || []) as WallCard[]).filter((c) => !c.is_junk);
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
          <BrandWall header={header} cards={cards} creator={{ id: creator.id, handle: creator.handle, platform: p, displayName: creator.display_name || creator.handle }} signedIn={!!user} roster={(roster || []) as RosterCreator[]} />
        </>
      )}
    </div>
  );
}

