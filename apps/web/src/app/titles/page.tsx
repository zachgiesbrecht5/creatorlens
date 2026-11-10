import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { titleSearchAccess } from "@/lib/titlesearch";
import { TitleSearchForm } from "@/components/TitleSearch";

export const dynamic = "force-dynamic";

// Title Search: a topic in, the titles that broke out on YouTube for it out, each measured
// against its own channel so small channels' breakouts surface next to the big names.
export default async function TitlesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const a = await titleSearchAccess();
  if (!a.user) redirect("/login?next=/titles");
  const admin = supabaseAdmin();
  const { data: mine } = await admin.from("title_searches").select("id,prompt,format,window_days,status,items_n,created_at").eq("user_id", a.user.id).order("created_at", { ascending: false }).limit(12);
  const { data: recent } = a.view ? await admin.from("title_searches").select("id,prompt,format,window_days,items_n,created_at").eq("status", "done").neq("user_id", a.user.id).order("created_at", { ascending: false }).limit(12) : { data: [] };
  const meta = (r: { format: string; window_days: number }) => `${r.format === "any" ? "both" : r.format === "video" ? "long-form" : "Shorts"} · ${r.window_days === 365 ? "year" : `${r.window_days}d`}`;
  return (
    <div className="mx-auto max-w-4xl">
      <div className="label">Title Search · YouTube</div>
      <h1 className="h2 mt-1">Which titles are working right now?</h1>
      <p className="mt-2 max-w-2xl text-[14px] text-muted">Type a topic. Sponsorprint searches YouTube, measures every video against its own channel&apos;s usual views (so a 40K channel&apos;s breakout ranks above a big channel&apos;s normal upload), finds the title patterns that travel, and writes title shapes your creators can reuse. For one channel&apos;s own titles, open its print and use Title Lab.</p>
      <div className="card mt-6 p-5">
        <TitleSearchForm canRun={a.run} initial={q} />
        {!a.run && <p className="mt-3 text-[13px]">Title Search is on <Link href="/pricing" className="text-accent hover:underline">Pro and Agency</Link>.</p>}
        <p className="mt-3 text-[11px] text-muted">Up to {a.perDay} new searches a day. A search anyone ran in the last 7 days opens instantly.</p>
      </div>
      {!!mine?.length && (
        <section className="mt-8">
          <div className="label mb-2">your searches</div>
          <div className="grid gap-1.5 sm:grid-cols-2">{mine.map((r) => (
            <Link key={r.id} href={`/titles/${r.id}`} className="flex items-baseline justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:border-fg">
              <span className="truncate text-[13.5px] font-medium">{r.prompt}</span>
              <span className="num flex-none text-[10.5px] text-muted">{r.status === "done" ? `${r.items_n} titles` : r.status} · {meta(r)}</span>
            </Link>))}</div>
        </section>
      )}
      {!!recent?.length && (
        <section className="mt-8">
          <div className="label mb-2">recent searches from the team</div>
          <div className="grid gap-1.5 sm:grid-cols-2">{recent.map((r) => (
            <Link key={r.id} href={`/titles/${r.id}`} className="flex items-baseline justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:border-fg">
              <span className="truncate text-[13.5px] font-medium">{r.prompt}</span>
              <span className="num flex-none text-[10.5px] text-muted">{r.items_n} titles · {meta(r)}</span>
            </Link>))}</div>
        </section>
      )}
    </div>
  );
}
