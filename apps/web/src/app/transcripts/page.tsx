import Link from "next/link";
import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { TranscriptRequest } from "@/components/TranscriptRequest";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transcripts | Sponsorprint" };

const LABEL: Record<string, string> = { voice: "Talking", music: "Music or a sound", silent: "No sound", nofile: "Licensed audio, no file", unread: "Could not be read" };
const clean = (h?: string) => String(h || "").trim().replace(/^@/, "").toLowerCase();

export default async function Transcripts({ searchParams }: { searchParams: Promise<{ handle?: string; all?: string }> }) {
  const me = await currentProfile();
  if (!me) redirect("/login?next=/transcripts");
  if (me.plan !== "admin") redirect("/");
  const sp = await searchParams;
  const handle = /^[a-z0-9._]{1,30}$/.test(clean(sp.handle)) ? clean(sp.handle) : null;
  const showAll = sp.all === "1";
  const admin = supabaseAdmin();
  const { data: jobs } = await admin.from("transcript_jobs").select("id,handle,status,total,done,heard,error,created_at,finished_at").order("created_at", { ascending: false }).limit(30);
  let rows: any[] = [];
  if (handle) {
    let q = admin.from("post_transcripts").select("url,published_at,caption,likes,comments,seconds,audio,text").eq("handle", handle).order("published_at", { ascending: false }).limit(1000);
    if (!showAll) q = q.eq("audio", "voice");
    rows = (await q).data || [];
  }
  const running = (jobs || []).some((j) => j.status === "queued" || j.status === "running");

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">Transcripts</span>
        <h1 className="text-[28px] font-semibold tracking-tight">Everything a creator says, reel by reel.</h1>
        <p className="text-[14px] text-muted">Hears every Instagram reel start to finish and writes down what is said. Reels on licensed music come without a file from Instagram, so those are listed but can&apos;t be heard. Running it again only hears new reels.</p>
      </div>
      <TranscriptRequest />

      <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-white">
        {(jobs || []).length === 0 && <p className="px-4 py-3 text-[13px] text-muted">No runs yet.</p>}
        {(jobs || []).map((j) => (
          <div key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
            <Link href={`/transcripts?handle=${j.handle}`} className="font-medium hover:underline">@{j.handle}</Link>
            <span className="font-mono text-[11px] uppercase text-muted">{j.status}</span>
            <span className="text-muted">{j.total == null ? "finding reels" : `${j.done} of this run heard · ${j.total} reels on the account · ${j.heard} with talking`}</span>
            {j.error && <span className="text-muted">{j.error}</span>}
            <span className="ml-auto flex gap-3 font-mono text-[11px]">
              <a className="hover:underline" href={`/api/transcripts?handle=${j.handle}&format=md`}>.md</a>
              <a className="hover:underline" href={`/api/transcripts?handle=${j.handle}&format=csv`}>.csv</a>
            </span>
          </div>
        ))}
      </div>
      {running && <p className="font-mono text-[11px] text-muted">A run is in progress. Refresh to see new reels.</p>}

      {handle && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <h2 className="mr-2 text-[18px] font-semibold">@{handle}</h2>
            <Link href={`/transcripts?handle=${handle}`} className={`rounded-md px-3 py-1.5 ${!showAll ? "bg-fg text-white" : "border border-line hover:border-fg"}`}>Talking only</Link>
            <Link href={`/transcripts?handle=${handle}&all=1`} className={`rounded-md px-3 py-1.5 ${showAll ? "bg-fg text-white" : "border border-line hover:border-fg"}`}>Every reel</Link>
            <span className="font-mono text-[11px] text-muted">{rows.length} shown</span>
          </div>
          {rows.length === 0 && <p className="text-[13px] text-muted">Nothing filed yet for this creator.</p>}
          {rows.map((r) => (
            <article key={r.url} className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
                <span>{String(r.published_at || "").slice(0, 10)}</span>
                <span>{LABEL[r.audio] || r.audio}{r.seconds ? ` · ${Math.round(r.seconds)}s` : ""}</span>
                <span>{(r.likes ?? 0).toLocaleString("en-US")} likes · {(r.comments ?? 0).toLocaleString("en-US")} comments</span>
                <a href={r.url} target="_blank" rel="noreferrer" className="ml-auto hover:underline">open post</a>
              </div>
              {r.text && <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{r.audio === "music" ? `Sung or sampled: ${r.text}` : r.text}</p>}
              {r.caption && <p className="text-[12px] text-muted">Caption: {String(r.caption).slice(0, 400)}</p>}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
