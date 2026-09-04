import Link from "next/link";
import { supabaseAdmin, currentUser } from "@/lib/supabase";
import { BrandWall, type WallCard, type RosterCreator } from "@/components/BrandWall";
import { ScanProgress } from "@/components/ScanProgress";
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
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="label mb-4">{p === "youtube" ? "YouTube" : "Instagram"}</div>
        <h1 className="h2">@{h}</h1>
        {job && (job.status === "queued" || job.status === "running" || job.status === "rate_limited") ? (
          <ScanProgress jobId={job.id} initialStatus={job.status} />
        ) : job?.status === "failed" ? (
          <div className="card mt-8 p-6 text-sm text-bad">Scan failed: {job.error}. Your credit was refunded.</div>
        ) : (
          <p className="mt-6 text-muted">Not in the database yet. <Link href="/" className="underline hover:text-fg">Scan it from the home page.</Link></p>
        )}
      </div>
    );
  }

  const { data: wall } = await admin.from("brand_wall").select("*").eq("creator_id", creator.id).order("deals", { ascending: false }).order("best_score", { ascending: false });
  const cards = ((wall || []) as WallCard[]).filter((c) => !c.is_junk);
  const { data: roster } = user ? await admin.from("roster_creators").select("id,name,handle,platform,followers").eq("user_id", user.id).order("name") : { data: [] };
  const highMed = cards.filter((c) => c.best_label !== "Low");
  const repeat = highMed.filter((c) => c.repeat_partner).length;
  const active = job && ["queued", "running", "rate_limited"].includes(job.status);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
        <div className="flex items-center gap-5">
          {creator.avatar_url ? <img src={creator.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" /> : <div className="h-20 w-20 rounded-full bg-surface2" />}
          <div className="min-w-0">
            <div className="label mb-2">{p === "youtube" ? "YouTube" : "Instagram"} · @{creator.handle}</div>
            <h1 className="h2 truncate text-3xl">{creator.display_name || creator.handle}</h1>
            <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-muted">
              <a className="hover:text-fg" href={p === "youtube" ? `https://youtube.com/@${creator.handle}` : `https://instagram.com/${creator.handle}`} target="_blank" rel="noreferrer">open profile ↗</a>
              <span>{fmt(creator.followers)} {p === "youtube" ? "subscribers" : "followers"}</span>
              <span>scanned {creator.last_scanned_at ? new Date(creator.last_scanned_at).toLocaleDateString() : "never"}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-10">
          <Stat n={highMed.length} label="brands" />
          <Stat n={highMed.reduce((s, c) => s + Number(c.deals), 0)} label="deals" />
          <Stat n={repeat} label="repeat" />
        </div>
      </div>

      {creator.bio && <p className="mt-6 max-w-3xl line-clamp-3 text-sm leading-relaxed text-muted" title={creator.bio}>{creator.bio}</p>}
      {active && <ScanProgress jobId={job!.id} initialStatus={job!.status} compact />}

      <BrandWall cards={cards} creator={{ id: creator.id, handle: creator.handle, platform: p, displayName: creator.display_name || creator.handle }} signedIn={!!user} roster={(roster || []) as RosterCreator[]} />
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="text-4xl font-semibold tracking-tight">{n}</div>
      <div className="label mt-1">{label}</div>
    </div>
  );
}
