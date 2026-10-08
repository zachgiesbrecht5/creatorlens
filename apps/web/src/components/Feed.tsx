"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cleanLine } from "@/lib/clean-text";

export type FeedItem = {
  key: string; url: string; thumb: string | null;
  line: string; src: "SAID" | "ON VIDEO" | "ON COVER" | "CAPTION" | "TRENDING SOUND" | "MUSIC";
  metric: number; metric_label: string; mult: number | null; published_at: string | null; sponsored: boolean;
  creator: string; handle: string; platform: string; avatar: string | null; followers: number | null;
  you: boolean;                       // the viewer's own post
  why: string;                        // one line: why this post worked, in plain words
};
const fmtK = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const BADGE: Record<FeedItem["src"], string> = { SAID: "bg-[#2f5bff]", "ON VIDEO": "bg-[#6b38c7]", "ON COVER": "bg-[#6b38c7]", CAPTION: "bg-[#5b6472]", "TRENDING SOUND": "bg-[#5b6472]", MUSIC: "bg-[#5b6472]" };

/** One post per screen, vertical snap. Each card leads with why it worked (the opening, the multiple, who),
 *  not just the video. "Save as idea" files it under the creator's experiments for the manager to see. */
export function Feed({ items, first }: { items: FeedItem[]; first: string }) {
  const [saved, setSaved] = useState<Record<string, "saving" | "saved" | "already">>({});
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const on = () => setI(Math.round(el.scrollTop / el.clientHeight));
    el.addEventListener("scroll", on, { passive: true }); return () => el.removeEventListener("scroll", on);
  }, []);
  async function save(it: FeedItem) {
    setSaved((s) => ({ ...s, [it.key]: "saving" }));
    const r = await fetch("/api/me/idea", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idea: `Try an opening like "${it.line}" (${it.creator}, ${fmtK(it.metric)}${it.mult ? `, ${it.mult}x their median` : ""})`, hook: it.line, why: it.why, post_url: it.url }) });
    const j = await r.json().catch(() => ({}));
    setSaved((s) => ({ ...s, [it.key]: j.already ? "already" : "saved" }));
  }
  if (!items.length) return <div className="card p-6 text-[13.5px] text-muted">Nothing in the feed yet, {first}. Follow a few creators on your lane and their best posts show up here.</div>;
  return (
    <div className="relative">
      <div ref={box} className="feed-box snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-2xl bg-black" style={{ height: "calc(100dvh - 120px)", scrollbarWidth: "none" }}>
        {items.map((it, idx) => (
          <article key={it.key} className="relative snap-start" style={{ height: "calc(100dvh - 120px)" }}>
            {it.thumb ? <img src={`data:image/jpeg;base64,${it.thumb}`} alt="" className="absolute inset-0 h-full w-full object-cover" loading={idx < 2 ? "eager" : "lazy"} /> : <div className="absolute inset-0 bg-gradient-to-br from-[#2E1B5B] to-[#0b0d12]" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/40" />
            {/* top: who */}
            <div className="absolute left-0 right-0 top-0 flex items-center justify-between gap-3 p-4">
              <span className="flex min-w-0 items-center gap-2 text-white">{it.avatar ? <img src={it.avatar} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-white/30" /> : <span className="inline-block h-8 w-8 rounded-full bg-white/20" />}<span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold">{it.you ? "You" : it.creator}</span><span className="num block text-[10.5px] text-white/60">@{it.handle} · {fmtK(it.followers)}</span></span></span>
              <span className="num rounded-full bg-white/15 px-2.5 py-1 text-[10px] text-white/80">{idx + 1} / {items.length}</span>
            </div>
            {/* bottom: the why */}
            <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
              <div className="mb-2 flex flex-wrap items-center gap-1.5"><span className={`rounded px-1.5 py-[2px] text-[9.5px] font-bold tracking-wide ${BADGE[it.src]}`}>{it.src}</span>{it.you && <span className="rounded bg-emerald-500 px-1.5 py-[2px] text-[9.5px] font-bold tracking-wide">YOUR POST</span>}{it.sponsored && <span className="rounded bg-white/20 px-1.5 py-[2px] text-[9.5px] font-bold tracking-wide">SPONSORED</span>}<span className="num text-[10.5px] text-white/60">{d(it.published_at)}</span></div>
              <div className="text-[19px] font-semibold leading-snug tracking-tight">"{cleanLine(it.line)}"</div>
              <div className="num mt-2 flex items-baseline gap-3"><span className="text-[26px] font-bold leading-none">{fmtK(it.metric)}</span><span className="text-[11px] text-white/70">{it.metric_label}</span>{it.mult && <span className="text-[12px] font-semibold text-emerald-300">{it.mult}x {it.you ? "your" : "their"} median</span>}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-white/85">{it.why}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a href={it.url} target="_blank" rel="noreferrer" className="rounded-full bg-white px-4 py-2 text-[12.5px] font-semibold text-black">watch the post</a>
                {!it.you && <button onClick={() => save(it)} disabled={!!saved[it.key]} className="rounded-full border border-white/40 px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-70">{saved[it.key] === "saving" ? "saving…" : saved[it.key] === "already" ? "already in your ideas" : saved[it.key] === "saved" ? "saved as idea ✓" : "save as idea"}</button>}
                {!it.you && <Link href={`/c/${it.platform}/${it.handle}`} className="num text-[11px] text-white/70 hover:text-white">their full print →</Link>}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="num mt-2 flex items-center justify-between text-[10.5px] text-dim"><span>swipe or scroll · {items.length} posts · ranked by how far each beat its own creator's median</span><span>{i + 1} / {items.length}</span></div>
    </div>
  );
}
