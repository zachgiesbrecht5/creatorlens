"use client";
import { useState } from "react";
import Link from "next/link";
import type { LaneHook, LaneCreator } from "@/lib/lane-digest";

const fmtK = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const pct = (g: number | null) => (g == null ? null : `${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}%`);

/** Hook shapes winning in the lane: each bar is the average multiple of the creator's OWN median
 *  (size-neutral). Click a row to see the posts behind it and the line that was said. */
export function LaneHooks({ hooks, note, printHref = true }: { hooks: LaneHook[]; note: string; printHref?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(...hooks.map((h) => h.mult ?? 0), 1);
  if (!hooks.length) return null;
  return (
    <div className="card mt-3 p-4">
      <div className="num mb-0.5 text-[10.5px] tracking-[0.15em] text-muted">HOOK SHAPES WINNING IN THE LANE</div>
      <div className="mb-3 text-[11.5px] text-muted">Bar = how far posts with this opener beat their own creator's median, on average. Click one to see the posts.</div>
      <div className="space-y-1">
        {hooks.map((h) => {
          const on = open === h.hook;
          return (
            <div key={h.hook}>
              <button onClick={() => setOpen(on ? null : h.hook)} className="grid w-full grid-cols-[150px_1fr_150px] items-center gap-3 rounded-md px-1 py-1 text-left text-[12.5px] hover:bg-surface2" aria-expanded={on}>
                <span className="truncate font-medium">"{h.hook}"</span>
                <div className="h-2 rounded-full bg-surface2"><div className="h-2 rounded-full" style={{ width: `${Math.max(4, ((h.mult ?? 0) / max) * 100)}%`, background: on ? "#2f5bff" : "#2E1B5B" }} /></div>
                <span className="num text-right text-[10.5px] text-muted" title={`raw average ${fmtK(h.avg)}`}>{h.mult != null ? `${h.mult}x median` : `avg ${fmtK(h.avg)}`} · {h.posts} posts · {h.creators} creator{h.creators === 1 ? "" : "s"}</span>
              </button>
              {on && (
                <div className="mb-2 ml-1 mt-1 rounded-md border border-line bg-surface p-3">
                  {h.examples.length === 0 ? <div className="text-[12px] text-muted">None of these posts made a creator's top 10, so there's nothing to show yet. The shape is counted from all {h.posts} posts in their captions.</div> : (
                    <>
                      <div className="num mb-1.5 text-[10px] uppercase tracking-wide text-muted">Best examples in the lane</div>
                      <ul className="space-y-1.5">{h.examples.map((p) => (
                        <li key={p.url} className="flex items-start gap-2 text-[12.5px]">
                          <span className="num w-14 flex-none text-right font-semibold">{fmtK(p.metric)}</span>
                          <span className="min-w-0 flex-1">
                            <a href={p.url} target="_blank" rel="noreferrer" className="block truncate hover:text-accent">"{p.on_screen || p.hook || p.title}"</a>
                            <span className="num text-[10.5px] text-muted">{p.on_screen ? "said / on video · " : "caption · "}{printHref ? <Link href={`/c/${p.platform}/${p.handle}`} className="hover:text-accent">{p.creator}</Link> : p.creator} · {p.mult ? `${p.mult}x their median · ` : ""}{d(p.published_at)}{p.sponsored ? " · sponsored" : ""}</span>
                          </span>
                        </li>))}</ul>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {note && <div className="mt-3 text-[11px] text-dim">{note}</div>}
    </div>
  );
}

/** The lane roster: who's being followed, how big they are, how fast they're growing, and what they lean on. */
export function LaneRoster({ creators, printHref = true, you }: { creators: LaneCreator[]; printHref?: boolean; you?: { followers: number | null; growth30: number | null; median: number | null } }) {
  if (!creators.length) return null;
  return (
    <div className="card mt-3 overflow-x-auto p-0">
      <table className="tbl">
        <thead><tr><th>Creator</th><th className="text-right">Size</th><th className="text-right">30-day growth</th><th className="text-right">Median post</th><th>Leans on</th><th>Last print</th></tr></thead>
        <tbody>
          {you && <tr className="bg-surface2/60"><td className="font-medium">You</td><td className="num text-right">{fmtK(you.followers)}</td><td className={`num text-right ${you.growth30 != null && you.growth30 < 0 ? "text-bad" : "text-ok"}`}>{pct(you.growth30) || <span className="text-dim">needs 2 weeks</span>}</td><td className="num text-right">{fmtK(you.median)}</td><td></td><td></td></tr>}
          {creators.map((c) => (
            <tr key={c.id}>
              <td><div className="flex items-center gap-2">{c.avatar ? <img src={c.avatar} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="inline-block h-7 w-7 rounded-full bg-surface2" />}<div className="min-w-0"><div className="truncate text-[13px] font-medium">{printHref ? <Link href={`/c/${c.platform}/${c.handle}`} className="hover:text-accent">{c.name}</Link> : <a href={`https://${c.platform === "youtube" ? "youtube.com/" : "instagram.com/"}${c.handle}`} target="_blank" rel="noreferrer" className="hover:text-accent">{c.name}</a>}</div><div className="num text-[10px] text-muted">@{c.handle}{c.added_by === "creator" ? " · you follow" : c.added_by ? " · manager's pick" : ""}</div></div></div></td>
              <td className="num text-right">{fmtK(c.followers)}</td>
              <td className={`num text-right ${c.growth30 != null && c.growth30 < 0 ? "text-bad" : c.growth30 != null ? "text-ok" : ""}`}>{pct(c.growth30) || <span className="text-dim">not yet</span>}</td>
              <td className="num text-right">{fmtK(c.median)}{c.items ? <span className="text-[10px] text-muted"> / {c.items}</span> : ""}</td>
              <td className="text-[12px]">{c.leans ? `"${c.leans}"` : <span className="text-dim">no pattern</span>}</td>
              <td className="num text-[11px] text-muted">{d(c.lastPrinted)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[10.5px] text-dim">Growth compares today's follower count with the print about a month ago; new follows show it after their second weekly print. Median post = the middle post's engagement over the posts printed.</div>
    </div>
  );
}
