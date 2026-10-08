import Link from "next/link";
import type { LaneBrief as Brief } from "@/lib/lane-brief";
import { TOPICS } from "@/lib/lane-brief";
import { cleanLine } from "@/lib/clean-text";
import { TryThis } from "@/components/TryThis";

const fmtK = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const topicLabel = (k: string) => TOPICS.find((t) => t.key === k)?.label || k;
const lineOf = (t: any) => cleanLine(String(t?.spoken || t?.on_video || t?.on_screen || t?.hook || t?.title || ""));

/** The lane as a brief: what to try, where the lane is going that you aren't, and your own best for comparison.
 *  Server component; the cards below it are the evidence. */
export function LaneBrief({ brief, first, laneSize, printHref = true }: { brief: Brief; first: string; laneSize: number; printHref?: boolean }) {
  const empty = !brief.tryThis.length && !brief.gaps.length;
  return (
    <section className="space-y-4">
      {/* 1. try this week */}
      <div className="card p-5" style={{ borderTop: "3px solid #2f5bff" }}>
        <div className="label mb-1">Try this week</div>
        <h2 className="h2">Openings your lane rewards that you haven't used</h2>
        <p className="mt-1 text-[13px] text-muted">Patterns that more than one creator in your lane gets rewarded for, grouped by the words they share, measured against each creator's own median. None of them appear in your last 250 posts. Thumbs up to keep one, thumbs down for the next.</p>
        {!brief.tryThis.length ? (
          <div className="mt-3 text-[13px] text-muted">{brief.usedOpeners ? `You already use ${brief.usedOpeners} of the openings that repeat in your lane. Nothing new to steal this week; the cards below show what each one is doing.` : "Not enough repeated openings in the lane yet. Follow a few more creators you rate and this fills in after their first print."}</div>
        ) : <TryThis candidates={brief.tryThis} ownTopics={brief.ownTopics} printHref={printHref} />}
      </div>

      {/* 2. gaps */}
      {brief.gaps.length > 0 && (
        <div className="card p-5">
          <div className="label mb-1">Where your lane is going that you aren't</div>
          <h2 className="h2">Subjects in the lane's best posts that none of your top posts touch</h2>
          <p className="mt-1 text-[13px] text-muted">Counted from the lane's best posts in the window against your own top posts. Not a verdict; a place to look.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {brief.gaps.map((g) => (
              <div key={g.key} className="rounded-lg border border-line bg-surface p-3">
                <div className="text-[14px] font-semibold">{g.label}</div>
                <div className="num text-[11px] text-muted">{g.lanePosts} lane posts · {g.creators} creators · 0 of yours</div>
                {g.example && <div className="mt-2 text-[12.5px]"><a href={g.example.post.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium hover:text-accent">"{lineOf(g.example.post)}"</a><div className="num mt-0.5 text-[10.5px] text-muted">{fmtK(Number(g.example.post.metric))}{g.example.mult ? ` · ${g.example.mult}x their median` : ""} · {g.example.display_name}</div></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. your best */}
      {brief.own.length > 0 && (
        <div className="card p-5">
          <div className="label mb-1">Your best, for comparison</div>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {brief.own.map((o) => (
              <a key={o.url} href={o.url} target="_blank" rel="noreferrer" className="flex gap-3 rounded-lg border border-line bg-surface p-3 hover:border-accent">
                {o.thumb ? <img src={`data:image/jpeg;base64,${o.thumb}`} alt="" className="h-16 w-12 flex-none rounded object-cover" /> : <span className="inline-block h-16 w-12 flex-none rounded bg-surface2" />}
                <div className="min-w-0"><div className="num text-[14px] font-bold">{fmtK(o.metric)} <span className="text-[10px] font-normal text-ok">{o.mult ? `${o.mult}x your median` : ""}</span></div><div className="line-clamp-2 text-[12.5px] leading-snug">"{cleanLine(o.line)}"</div><div className="num mt-0.5 text-[10px] text-muted">{o.src} · {d(o.published_at)}</div></div>
              </a>
            ))}
          </div>
          {brief.ownTopics.length > 0 && <div className="num mt-3 text-[10.5px] text-dim">Your top posts cover: {brief.ownTopics.map(topicLabel).join(", ")}.</div>}
        </div>
      )}
      {empty && !brief.own.length && <div className="card p-5 text-[13px] text-muted">Nothing to compare yet, {first}. Your own print and a few followed creators turn this into a brief.</div>}
    </section>
  );
}
