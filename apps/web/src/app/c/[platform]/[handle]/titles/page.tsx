import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { titleLabAccess } from "@/lib/titlelab";
import { UnlockCreator } from "@/components/UnlockCreator";
import { TitleLabRun, PatternTable, TitleRow, TitleRewriter, FeedbackNote, type Lab } from "@/components/TitleLab";
import { fmt } from "@/lib/fmt";

export const dynamic = "force-dynamic";

// Title Lab: a YouTube channel's titles against its own median, what the winners do, and a
// rewriter for the next upload. Built for giving a creator feedback on their titles.
export default async function TitleLabPage({ params }: { params: Promise<{ platform: string; handle: string }> }) {
  const { platform, handle } = await params;
  if (platform !== "youtube") notFound();
  const h = decodeURIComponent(handle).replace(/^@/, "");
  const admin = supabaseAdmin();
  const { data: c } = await admin.from("creators").select("id").eq("platform", "youtube").or(`handle.ilike.${h},external_id.eq.${h}`).maybeSingle();
  if (!c) notFound();
  const a = await titleLabAccess(c.id);
  if (!a.creator) notFound();
  const creator = a.creator;
  const firstName = String(creator.display_name || creator.handle).split(/\s+/)[0];
  const back = `/c/youtube/${encodeURIComponent(creator.handle)}`;

  if (!a.view) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href={back} className="num text-[11px] text-dim hover:text-accent">← back to the print</Link>
        <h1 className="mt-3 text-[22px] font-semibold">Title Lab · {creator.display_name || creator.handle}</h1>
        <UnlockCreator platform="youtube" handle={creator.handle} signedIn={!!a.user} brands={0} />
      </div>
    );
  }

  const { data: labRow } = await admin.from("title_labs").select("status,error,items,items_n,median_video,median_short,patterns,reading,finished_at").eq("creator_id", creator.id).maybeSingle();
  const lab = (labRow as Lab) || null;
  const items = lab?.items || [];
  const settled = items.filter((i) => !i.climbing && i.mult != null);
  const n = Math.min(12, Math.max(4, Math.round(settled.length * 0.2)));
  const top = settled.slice(0, n);
  const bottom = settled.slice(-n).reverse();
  const climbing = items.filter((i) => i.climbing);
  const reading = lab?.reading || null;
  const done = lab?.status === "done";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-baseline justify-between gap-3"><Link href={back} className="num text-[11px] text-dim hover:text-accent">← back to the print</Link><Link href="/titles" className="num text-[11px] text-dim hover:text-accent">search titles across YouTube →</Link></div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {creator.avatar_url ? <img src={creator.avatar_url} alt="" className="h-12 w-12 rounded-full" /> : <div className="h-12 w-12 rounded-full bg-surface2" />}
          <div>
            <div className="label">Title Lab · YouTube · @{creator.handle}</div>
            <h1 className="text-[22px] font-semibold leading-tight">{creator.display_name || creator.handle}</h1>
            <div className="num text-[11px] text-muted">{fmt(creator.followers)} subscribers{creator.category && creator.category !== "Other" ? ` · ${creator.category}` : ""}</div>
          </div>
        </div>
        <TitleLabRun creatorId={creator.id} lab={lab} canRun={a.run} firstName={firstName} />
      </div>

      {!lab || lab.status === "none" || (lab.status === "failed" && !items.length) ? (
        <div className="card mt-8 p-6">
          <h2 className="text-[16px] font-semibold">What this does</h2>
          <p className="mt-2 text-[13.5px] text-muted">Pulls the channel&apos;s last two years of uploads, scores every title against the channel&apos;s own median (Shorts against the Shorts median, videos under 10 days old set aside), measures which title patterns travel, then reads the strongest and weakest titles and writes a note you can send {firstName}. One run costs a few YouTube units and about a cent.</p>
          {!a.run && a.user && <p className="mt-3 text-[13px]">Running a read is on <Link href="/pricing" className="text-accent underline-offset-2 hover:underline">Pro and Agency</Link>.</p>}
        </div>
      ) : (
        <>
          {/* stats strip */}
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="card p-3"><div className="label">videos read</div><div className="num text-[20px] font-semibold">{lab.items_n}</div></div>
            <div className="card p-3"><div className="label">median · video</div><div className="num text-[20px] font-semibold">{lab.median_video != null ? fmt(lab.median_video) : "–"}</div></div>
            <div className="card p-3"><div className="label">median · short</div><div className="num text-[20px] font-semibold">{lab.median_short != null ? fmt(lab.median_short) : "–"}</div></div>
            <div className="card p-3"><div className="label">best title</div><div className="num text-[20px] font-semibold text-ok">{top[0]?.mult != null ? `${top[0].mult}x` : "–"}</div></div>
          </div>

          {/* the read */}
          {reading ? (
            <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="card p-5">
                <div className="label mb-2">what the winners do</div>
                <p className="text-[14.5px] leading-relaxed text-fg">{reading.summary}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="label mb-1.5 text-ok">works here</div>
                    <ul className="space-y-2.5">{reading.winning.map((w, i) => <li key={i}><div className="text-[13.5px] font-semibold">{w.name}</div><div className="text-[12.5px] text-muted">{w.why}</div>{w.examples[0] && <div className="mt-0.5 truncate text-[12px] italic text-fg" title={w.examples.join(" · ")}>&ldquo;{w.examples[0]}&rdquo;</div>}</li>)}</ul>
                  </div>
                  <div>
                    <div className="label mb-1.5 text-bad">falls flat</div>
                    <ul className="space-y-2.5">{reading.weak.map((w, i) => <li key={i}><div className="text-[13.5px] font-semibold">{w.name}</div><div className="text-[12.5px] text-muted">{w.why}</div>{w.examples[0] && <div className="mt-0.5 truncate text-[12px] italic text-fg" title={w.examples.join(" · ")}>&ldquo;{w.examples[0]}&rdquo;</div>}</li>)}</ul>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div><div className="label mb-1">next title: do</div><ul className="list-disc space-y-1 pl-4 text-[13px]">{reading.rules.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                  <div><div className="label mb-1">avoid</div><ul className="list-disc space-y-1 pl-4 text-[13px]">{reading.avoid.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                </div>
                <p className="mt-4 text-[11px] text-muted">Titles correlate with views; thumbnails, topic and the algorithm&apos;s mood do too. Read this as &ldquo;tends to&rdquo;, not cause.</p>
              </div>
              <div className="space-y-4">
                <FeedbackNote text={reading.feedback} firstName={firstName} />
                <div className="card p-4">
                  <div className="label mb-2">try a title</div>
                  <TitleRewriter creatorId={creator.id} disabled={!done || !a.run} />
                </div>
              </div>
            </section>
          ) : (
            <div className="card mt-6 p-4 text-[13px] text-muted">{lab.error || "The model read is not in yet; the numbers below are."}</div>
          )}

          {/* lift table */}
          <section className="card mt-6 p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><div className="label">pattern lift</div><div className="text-[12px] text-muted">median multiple of titles with the pattern ÷ without · {settled.length} settled titles</div></div>
            <PatternTable patterns={lab.patterns || []} />
          </section>

          {/* top vs bottom */}
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-baseline justify-between"><div className="label text-ok">strongest titles</div><div className="num text-[11px] text-muted">top {top.length} by multiple</div></div>
              <div className="space-y-1.5">{top.map((i, k) => <TitleRow key={i.id} i={i} rank={k + 1} kindMedian={i.kind === "short" ? lab.median_short : lab.median_video} />)}</div>
            </div>
            <div>
              <div className="mb-2 flex items-baseline justify-between"><div className="label text-bad">weakest titles</div><div className="num text-[11px] text-muted">bottom {bottom.length}</div></div>
              <div className="space-y-1.5">{bottom.map((i) => <TitleRow key={i.id} i={i} kindMedian={i.kind === "short" ? lab.median_short : lab.median_video} />)}</div>
            </div>
          </section>

          {climbing.length > 0 && (
            <section className="mt-6">
              <div className="mb-2 flex items-baseline justify-between"><div className="label">still climbing</div><div className="num text-[11px] text-muted">under 10 days old · not in the medians yet</div></div>
              <div className="grid gap-1.5 md:grid-cols-2">{climbing.map((i) => <TitleRow key={i.id} i={i} kindMedian={null} />)}</div>
            </section>
          )}

          <details className="mt-6">
            <summary className="label cursor-pointer">every title ({settled.length})</summary>
            <div className="mt-2 grid gap-1.5 md:grid-cols-2">{settled.map((i, k) => <TitleRow key={i.id} i={i} rank={k + 1} kindMedian={i.kind === "short" ? lab.median_short : lab.median_video} />)}</div>
          </details>
        </>
      )}
    </div>
  );
}
