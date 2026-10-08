"use client";
import { useState } from "react";
import Link from "next/link";
import type { LaneTopPost } from "@/lib/lane-digest";
import { cleanLine } from "@/lib/clean-text";

const fmtK = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

/** What a viewer gets first: the spoken line when there is one, else text on video, else the caption. */
function opening(t: any): { line: string; src: string; cls: string } {
  if (t.audio === "voice" && t.spoken) return { line: cleanLine(t.spoken), src: "SAID", cls: "bg-[#2f5bff] text-white" };
  if (t.on_video) return { line: cleanLine(t.on_video), src: "ON VIDEO", cls: "bg-[#6b38c7] text-white" };
  if (t.on_screen) return { line: cleanLine(t.on_screen), src: "ON COVER", cls: "bg-[#6b38c7] text-white" };
  const why = t.audio === "sound" ? "TRENDING SOUND" : t.audio === "music" ? "MUSIC" : t.audio === "nofile" ? "NO AUDIO FILE" : "CAPTION";
  return { line: cleanLine(t.hook || t.title || ""), src: why, cls: "bg-[#5b6472] text-white" };
}

/** The lane's best posts as cards. `all` and `talking` are two pre-fetched lists; the toggle swaps them. */
export function LaneCards({ all, talking, printHref = true, title = "Best in your lane", sub, fit, limit }: { all: LaneTopPost[]; talking: LaneTopPost[]; printHref?: boolean; title?: string; sub?: string; fit?: { min: number; max: number } | null; limit?: number }) {
  const inBand = (r: LaneTopPost) => !fit || !r.followers || (r.followers >= fit.min && r.followers <= fit.max);
  const [mode, setMode] = useState<"all" | "talking">(talking.filter(inBand).length >= 4 ? "talking" : "all");
  // fit: accounts near this creator's size (0.3x to 5x). On by default when it leaves enough to look at.
  const [fitOn, setFitOn] = useState<boolean>(!!fit && (mode === "talking" ? talking : all).filter(inBand).length >= 4);
  const base = mode === "talking" ? talking : all;
  const rows = (fitOn ? base.filter(inBand) : base).slice(0, limit ?? base.length);
  const hidden = fitOn ? base.length - base.filter(inBand).length : 0;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>{title && <div className="label">{title}</div>}{sub && <p className="mt-1 text-[13px] text-muted">{sub}</p>}</div>
        <div className="flex flex-wrap items-center gap-2">
          {fit && <div className="seg" title={`${fmtK(fit.min)} to ${fmtK(fit.max)} followers`}><button className={fitOn ? "on" : ""} onClick={() => setFitOn(true)}>my size</button><button className={!fitOn ? "on" : ""} onClick={() => setFitOn(false)}>everyone</button></div>}
          <div className="seg"><button className={mode === "talking" ? "on" : ""} onClick={() => setMode("talking")}>talking openers</button><button className={mode === "all" ? "on" : ""} onClick={() => setMode("all")}>everything</button></div>
        </div>
      </div>
      {fit && fitOn && hidden > 0 && <div className="num mb-2 text-[10.5px] text-dim">{hidden} post{hidden === 1 ? "" : "s"} from accounts outside {fmtK(fit.min)}–{fmtK(fit.max)} followers hidden · "everyone" shows them</div>}
      {!rows.length ? <div className="card p-6 text-[13.5px] text-muted">{mode === "talking" ? "No reels with a spoken opening yet; prints land weekly." : "Follow a few creators you rate and their best posts show up here."}</div> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => { const t = r.post; const o = opening(t); return (
            <div key={`${r.creator_id}:${t.url}`} className="post-card">
              <a href={t.url} target="_blank" rel="noreferrer">
                {t.thumb ? <img src={`data:image/jpeg;base64,${t.thumb}`} alt="" className="post-thumb" /> : <div className="post-thumb flex items-end bg-gradient-to-br from-[#2E1B5B] to-[#0b0d12] p-3"><span className="line-clamp-4 text-[13px] font-medium leading-snug text-white/90">"{o.line}"</span></div>}
              </a>
              <div className="p-3">
                <div className="flex items-baseline justify-between"><span className="num text-[15px] font-bold">{fmtK(Number(t.metric))}</span><span className="num text-[10px] text-ok">{r.mult ? `${r.mult}x their median` : `top for them`}</span></div>
                <div className="mt-1 line-clamp-2 text-[12.5px] font-medium leading-snug">"{o.line}"</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><span className={`rounded px-1.5 py-[1px] text-[9.5px] font-bold tracking-wide ${o.cls}`}>{o.src}</span><span className="num text-[10px] text-muted">{d(t.published_at)}{t.sponsored ? " · sponsored" : ""}</span></div>
                <div className="mt-2 flex items-center gap-1.5">{r.avatar_url ? <img src={r.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" /> : <span className="inline-block h-5 w-5 rounded-full bg-surface2" />}{printHref ? <Link href={`/c/${r.platform}/${r.handle}`} className="num truncate text-[11px] text-muted hover:text-accent">{r.display_name}</Link> : <span className="num truncate text-[11px] text-muted">{r.display_name}</span>}<span className="num ml-auto text-[10px] text-dim">{fmtK(r.followers)}</span></div>
              </div>
            </div>); })}
        </div>
      )}
    </section>
  );
}
