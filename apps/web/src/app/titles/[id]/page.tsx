import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { titleSearchAccess } from "@/lib/titlesearch";
import { PatternTable } from "@/components/TitleLab";
import { TitleSearchStatus, TopicRow, CopyTemplates, type TopicItem } from "@/components/TitleSearch";

export const dynamic = "force-dynamic";

type Reading = { summary: string; winning: { name: string; why: string; examples: string[] }[]; weak: { name: string; why: string; examples: string[] }[]; rules: string[]; templates: { template: string; example: string }[]; angles: string[] } | null;

export default async function TitleSearchResult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await titleSearchAccess();
  if (!a.user) redirect(`/login?next=/titles/${id}`);
  if (!a.view) redirect("/pricing");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: s } = await supabaseAdmin().from("title_searches").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();
  const items = (s.items || []) as TopicItem[];
  const settled = items.filter((i) => !i.climbing && i.mult != null);
  const climbing = items.filter((i) => i.climbing);
  const reading = s.reading as Reading;
  const top = settled.slice(0, 25);
  const fmtLabel = s.format === "any" ? "long-form and Shorts" : s.format === "video" ? "long-form" : "Shorts";
  const estN = items.filter((i) => i.baseline_kind === "average").length;
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/titles" className="num text-[11px] text-dim hover:text-accent">← Title Search</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Title Search · {fmtLabel} · last {s.window_days === 365 ? "year" : `${s.window_days} days`}</div>
          <h1 className="text-[24px] font-semibold leading-tight">{s.prompt}</h1>
          {s.queries?.length > 0 && <div className="num mt-1 text-[11px] text-muted">searched: {s.queries.join(" · ")}</div>}
        </div>
        {s.status === "done" && <div className="num text-[11px] text-muted">{new Date(s.finished_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {s.items_n} titles · {s.channels_n} channels</div>}
      </div>

      <TitleSearchStatus id={s.id} status={s.status} prompt={s.prompt} />
      {s.status === "failed" && <div className="card mt-6 p-5 text-[13.5px] text-bad">{s.error || "The search failed."} <Link href={`/titles?q=${encodeURIComponent(s.prompt)}`} className="ml-1 text-accent hover:underline">Try again</Link></div>}

      {s.status === "done" && (
        <>
          {s.error && <div className="card mt-6 p-4 text-[13px] text-muted">{s.error}</div>}
          {reading && (
            <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="card p-5">
                <div className="label mb-2">what the breakouts do</div>
                <p className="text-[14.5px] leading-relaxed text-fg">{reading.summary}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div><div className="label mb-1.5 text-ok">works</div><ul className="space-y-2.5">{reading.winning.map((w, k) => <li key={k}><div className="text-[13.5px] font-semibold">{w.name}</div><div className="text-[12.5px] text-muted">{w.why}</div>{w.examples[0] && <div className="mt-0.5 truncate text-[12px] italic" title={w.examples.join(" · ")}>&ldquo;{w.examples[0]}&rdquo;</div>}</li>)}</ul></div>
                  <div><div className="label mb-1.5 text-bad">falls flat</div><ul className="space-y-2.5">{reading.weak.map((w, k) => <li key={k}><div className="text-[13.5px] font-semibold">{w.name}</div><div className="text-[12.5px] text-muted">{w.why}</div>{w.examples[0] && <div className="mt-0.5 truncate text-[12px] italic" title={w.examples.join(" · ")}>&ldquo;{w.examples[0]}&rdquo;</div>}</li>)}</ul></div>
                </div>
                {reading.rules.length > 0 && <div className="mt-4"><div className="label mb-1">for the next title</div><ul className="list-disc space-y-1 pl-4 text-[13px]">{reading.rules.map((r, k) => <li key={k}>{r}</li>)}</ul></div>}
                <p className="mt-4 text-[11px] text-muted">Titles correlate with views; thumbnails, topic and timing do too. Read this as &ldquo;tends to&rdquo;, not cause.</p>
              </div>
              <div className="space-y-4">
                {reading.templates.length > 0 && <div className="card p-4"><div className="label mb-2">title shapes to reuse</div><CopyTemplates templates={reading.templates} /></div>}
                {reading.angles.length > 0 && <div className="card p-4"><div className="label mb-2">angles that broke out</div><ul className="list-disc space-y-1 pl-4 text-[13px]">{reading.angles.map((x, k) => <li key={k}>{x}</li>)}</ul></div>}
              </div>
            </section>
          )}

          <section className="mt-6">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><div className="label text-ok">top titles</div><div className="num text-[11px] text-muted">views ÷ the channel&apos;s usual views · max 2 per channel{estN ? ` · "est" = vs the channel's lifetime average` : ""}</div></div>
            <div className="grid gap-1.5 md:grid-cols-2">{top.map((i, k) => <TopicRow key={i.id} i={i} rank={k + 1} />)}</div>
          </section>

          <section className="card mt-6 p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><div className="label">pattern lift across channels</div><div className="text-[12px] text-muted">median multiple with the pattern ÷ without · {settled.length} settled titles</div></div>
            <PatternTable patterns={s.patterns || []} />
            <p className="mt-3 text-[11px] text-muted">Every video here was found by searching, so even the weaker ones did reasonably well. Read lift as &ldquo;big breakouts vs ordinary results&rdquo;, with 8+ titles on each side.</p>
          </section>

          {climbing.length > 0 && (
            <section className="mt-6"><div className="mb-2 flex items-baseline justify-between"><div className="label">still climbing</div><div className="num text-[11px] text-muted">under 10 days old</div></div>
              <div className="grid gap-1.5 md:grid-cols-2">{climbing.slice(0, 12).map((i) => <TopicRow key={i.id} i={i} />)}</div></section>
          )}
          {settled.length > top.length && (
            <details className="mt-6"><summary className="label cursor-pointer">every title ({settled.length})</summary>
              <div className="mt-2 grid gap-1.5 md:grid-cols-2">{settled.slice(top.length).map((i, k) => <TopicRow key={i.id} i={i} rank={top.length + k + 1} />)}</div></details>
          )}
        </>
      )}
    </div>
  );
}
