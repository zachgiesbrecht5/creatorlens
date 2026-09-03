import Link from "next/link";
import { supabaseAdmin, currentUser } from "@/lib/supabase";
import { BrandWall, type WallCard } from "@/components/BrandWall";
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
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-2xl font-semibold">@{h}</h1>
        {job && (job.status === "queued" || job.status === "running" || job.status === "rate_limited") ? (
          <ScanProgress jobId={job.id} initialStatus={job.status} />
        ) : job?.status === "failed" ? (
          <div className="card mt-6 p-6 text-sm text-red-700">Scan failed: {job.error}. Your credit was refunded.</div>
        ) : (
          <p className="mt-4 text-slate-600">Not in the database yet. <Link href="/" className="text-brand underline">Scan it from the home page.</Link></p>
        )}
      </div>
    );
  }

  const { data: wall } = await admin.from("brand_wall").select("*").eq("creator_id", creator.id).order("deals", { ascending: false }).order("best_score", { ascending: false });
  const cards = (wall || []) as WallCard[];
  const highMed = cards.filter((c) => c.best_label !== "Low");
  const repeat = highMed.filter((c) => c.repeat_partner).length;
  const active = job && ["queued", "running", "rate_limited"].includes(job.status);

  return (
    <div>
      <div className="card flex flex-wrap items-center gap-5 p-5">
        {creator.avatar_url ? <img src={creator.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" /> : <div className="h-16 w-16 rounded-full bg-slate-200" />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">{creator.display_name || creator.handle}</h1>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-600">
            <a className="hover:text-brand" href={p === "youtube" ? `https://youtube.com/@${creator.handle}` : `https://instagram.com/${creator.handle}`} target="_blank" rel="noreferrer">
              {p === "youtube" ? "YouTube" : "Instagram"} · @{creator.handle}
            </a>
            <span>{fmt(creator.followers)} {p === "youtube" ? "subscribers" : "followers"}</span>
            <span>Scanned {creator.last_scanned_at ? new Date(creator.last_scanned_at).toLocaleDateString() : "never"}</span>
          </div>
          {creator.bio && <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-slate-500">{creator.bio}</p>}
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <Stat n={highMed.length} label="brands" />
          <Stat n={highMed.reduce((s, c) => s + Number(c.deals), 0)} label="deals" />
          <Stat n={repeat} label="repeat partners" />
        </div>
      </div>

      {active && <ScanProgress jobId={job!.id} initialStatus={job!.status} compact />}

      <BrandWall cards={cards} creator={{ id: creator.id, handle: creator.handle, platform: p, displayName: creator.display_name || creator.handle }} signedIn={!!user} />
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold">{n}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
