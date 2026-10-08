"use client";
import { useState } from "react";
import Link from "next/link";
import type { BriefOpener } from "@/lib/lane-brief";
import { TOPICS } from "@/lib/lane-brief";
import { cleanLine } from "@/lib/clean-text";

const fmtK = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const topicLabel = (k: string) => TOPICS.find((t) => t.key === k)?.label || k;

/** The "try this week" list with thumbs. Three show at a time from a deeper pool; a thumbs-down drops one and the
 *  next candidate slides in; a thumbs-up keeps it and files it as an idea to test. */
export function TryThis({ candidates, ownTopics, printHref = true }: { candidates: BriefOpener[]; ownTopics: string[]; printHref?: boolean }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const shown = candidates.filter((c) => !hidden.has(c.key)).slice(0, 3);
  async function vote(o: BriefOpener, v: 1 | -1) {
    const ex = o.examples[0];
    if (v === -1) setHidden((h) => new Set(h).add(o.key)); else setLiked((l) => new Set(l).add(o.key));
    fetch("/api/me/brief-vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "opener", key: o.key, vote: v, label: cleanLine(o.stem), example: ex ? cleanLine(ex.on_screen || ex.hook || ex.title) : null, example_url: ex?.url || null, why: `${o.creators} creators, ${o.posts} posts, ${o.mult}x their median` }) }).catch(() => {});
  }
  if (!shown.length) return <div className="mt-3 text-[13px] text-muted">{candidates.length ? "You've passed on everything the lane has this week. New prints land weekly; check back." : "Not enough repeated openings in the lane yet. Follow a few more creators you rate and this fills in after their first print."}</div>;
  return (
    <ol className="mt-4 space-y-3">
      {shown.map((o, i) => { const ex = o.examples[0]; const isLiked = liked.has(o.key); return (
        <li key={o.key} className={`grid gap-3 rounded-lg border bg-surface p-3 sm:grid-cols-[28px_1fr_auto] ${isLiked ? "border-ok/50" : "border-line"}`}>
          <div className="num text-[18px] font-bold text-accent">{i + 1}</div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-snug">Open with "{cleanLine(o.stem)}"{o.said && <span className="num ml-2 rounded bg-[#2f5bff] px-1 text-[9px] font-bold text-white align-middle">SAID</span>}{o.fit === "same" && <span className="num ml-2 rounded bg-okSoft px-1.5 text-[9px] font-bold text-ok align-middle">YOUR SUBJECT</span>}</div>
            <div className="num mt-1 text-[11px] text-muted">{o.posts} posts · {o.creators} creators · {o.mult != null ? `${o.mult}x their median on average` : `avg ${fmtK(o.avg)}`}{o.topics.length ? ` · ${o.topics.slice(0, 2).map(topicLabel).join(", ")}` : ""}</div>
            {ex && <div className="mt-2 text-[12.5px]">Best example: <a href={ex.url} target="_blank" rel="noreferrer" className="font-medium hover:text-accent">"{cleanLine(ex.on_screen || ex.hook || ex.title)}"</a> <span className="num text-[11px] text-muted">· {fmtK(ex.metric)}{ex.mult ? ` · ${ex.mult}x their median` : ""} · {printHref ? <Link href={`/c/${ex.platform}/${ex.handle}`} className="hover:text-accent">{ex.creator}</Link> : ex.creator} · {d(ex.published_at)}</span></div>}
            <div className="mt-1.5 text-[12px] text-dim">Why you: {o.said ? "a spoken first line, so it works with you on camera and no text on screen." : "a written opener, so it works as a caption or the first on-screen line."}{o.fit === "same" ? ` Same subject you already post about (${o.topics.filter((t) => ownTopics.includes(t)).slice(0, 2).map(topicLabel).join(", ")}), a new way in.` : o.fit === "new" ? ` A subject your top posts don't cover yet (${o.topics.slice(0, 2).map(topicLabel).join(", ")}).` : " The pattern travels; the subject is yours to pick."}</div>
          </div>
          <div className="flex items-start gap-1 sm:flex-col">
            <button onClick={() => vote(o, 1)} disabled={isLiked} title="Worth trying; save it as an idea" className={`rounded-md border px-2 py-1 text-[13px] ${isLiked ? "border-ok bg-okSoft" : "border-line hover:border-ok"}`}>👍</button>
            <button onClick={() => vote(o, -1)} title="Not for me; show something else" className="rounded-md border border-line px-2 py-1 text-[13px] hover:border-bad">👎</button>
          </div>
        </li>); })}
      <li className="num text-[10.5px] text-dim">👍 saves it to your ideas and tells your manager. 👎 hides it for good and the next one slides in. {candidates.length - shown.length - hidden.size > 0 ? `${candidates.length - shown.length - hidden.size} more waiting.` : ""}</li>
    </ol>
  );
}
