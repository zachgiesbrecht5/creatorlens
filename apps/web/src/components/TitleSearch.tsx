"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type TopicItem = {
  id: string; title: string; url: string; published_at: string; views: number; kind: string; mult: number | null; climbing: boolean; words: number; tags: string[];
  channel_id: string; channel_title: string; channel_handle: string; subs: number; baseline: number | null; baseline_kind: "median" | "average" | null;
};

const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const ago = (s: string) => { const d = Math.round((Date.now() - new Date(s).getTime()) / 864e5); return d <= 0 ? "today" : d === 1 ? "1 day ago" : d < 60 ? `${d} days ago` : new Date(s).toLocaleDateString("en-US", { month: "short", year: "numeric" }); };

const EXAMPLES = ["budget PC builds", "new dad finance", "home espresso for beginners", "small apartment makeover", "car detailing"];

/** Prompt box with format + window chips. Submits, then goes to the result page. */
export function TitleSearchForm({ canRun, initial }: { canRun: boolean; initial?: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(initial || "");
  const [format, setFormat] = useState<"any" | "video" | "short">("any");
  const [windowDays, setWindowDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go(p = prompt) {
    if (p.trim().length < 3 || busy) return;
    setBusy(true); setErr(null);
    const r = await fetch("/api/titlesearch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: p, format, windowDays }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 402) { window.location.href = "/pricing"; return; }
    if (!r.ok || !j.id) { setBusy(false); setErr(j.error || "Couldn't start the search."); return; }
    router.push(`/titles/${j.id}`);
  }
  const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-[12px] ${on ? "border-fg bg-fg text-surface" : "border-line text-muted hover:border-fg hover:text-fg"}`;
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} maxLength={120} disabled={!canRun}
          placeholder="A topic or niche, e.g. budget PC builds" className="flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-[15px] text-fg placeholder:text-muted focus:border-fg focus:outline-none disabled:opacity-50" />
        <button onClick={() => go()} disabled={!canRun || busy || prompt.trim().length < 3} className="btn-dark whitespace-nowrap disabled:opacity-50">{busy ? "starting…" : "Find winning titles →"}</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5"><span className="label mr-1">format</span>{(["any", "video", "short"] as const).map((f) => <button key={f} onClick={() => setFormat(f)} className={chip(format === f)}>{f === "any" ? "both" : f === "video" ? "long-form" : "Shorts"}</button>)}</div>
        <div className="flex items-center gap-1.5"><span className="label mr-1">posted in the last</span>{[30, 90, 365].map((d) => <button key={d} onClick={() => setWindowDays(d)} className={chip(windowDays === d)}>{d === 365 ? "year" : `${d} days`}</button>)}</div>
      </div>
      {!prompt && canRun && <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] text-muted">try: {EXAMPLES.map((e) => <button key={e} onClick={() => { setPrompt(e); go(e); }} className="underline-offset-2 hover:text-accent hover:underline">{e}</button>)}</div>}
      {err && <p className="mt-2 text-[12.5px] text-bad">{err}</p>}
    </div>
  );
}

/** Live status while the worker runs; refreshes the page when it lands. */
export function TitleSearchStatus({ id, status: initial, prompt }: { id: string; status: string; prompt: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (status !== "queued" && status !== "running") return;
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    const poll = setInterval(async () => {
      const r = await fetch(`/api/titlesearch?id=${id}`).then((x) => x.json()).catch(() => null);
      if (r?.status && r.status !== status) { setStatus(r.status); if (r.status === "done" || r.status === "failed") router.refresh(); }
    }, 3000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [id, status, router]);
  if (status !== "queued" && status !== "running") return null;
  const step = secs < 6 ? "turning the topic into searches" : secs < 18 ? "searching YouTube" : secs < 35 ? "measuring each video against its own channel" : "reading the winners";
  return (
    <div className="card mt-6 p-6">
      <div className="num text-[12px] text-muted"><span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" />{status === "queued" ? "in line" : step}… {secs}s</div>
      <p className="mt-2 text-[13.5px] text-muted">Searching YouTube for &ldquo;{prompt}&rdquo;. Usually under a minute. You can leave this page; the result stays under Titles.</p>
    </div>
  );
}

export function TopicRow({ i, rank }: { i: TopicItem; rank?: number }) {
  const est = i.baseline_kind === "average";
  return (
    <a href={i.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-lg border border-line p-2.5 hover:border-fg">
      <div className="num w-[68px] flex-none">
        {rank != null && <div className="text-[10px] text-muted">#{rank}</div>}
        <div className="text-[15px] font-semibold leading-tight text-fg" title={est ? "vs the channel's lifetime average views per video (estimate)" : "vs the median of the channel's recent uploads"}>{i.mult != null ? `${i.mult}x` : "–"}{est && <span className="ml-0.5 align-top text-[9px] font-normal text-muted">est</span>}</div>
        <div className="text-[10.5px] text-muted">{fmtN(i.views)} views</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold leading-snug text-fg">{i.title}</div>
        <div className="num mt-1 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted">
          <span className="text-fg">{i.channel_title}</span><span>{fmtN(i.subs)} subs · usually {i.baseline != null ? fmtN(i.baseline) : "?"} · {ago(i.published_at)} · {i.kind}{i.climbing ? " · still climbing" : ""}</span>
          {i.tags.filter((t) => !["short", "long", "named"].includes(t)).slice(0, 3).map((t) => <span key={t} className="rounded border border-line px-1 text-[9.5px] uppercase tracking-wide">{t.replace(/_/g, " ")}</span>)}
        </div>
      </div>
    </a>
  );
}

export function CopyTemplates({ templates }: { templates: { template: string; example: string }[] }) {
  const [copied, setCopied] = useState<number | null>(null);
  return (
    <ul className="space-y-2">
      {templates.map((t, k) => (
        <li key={k} className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><div className="font-mono text-[13px] text-fg">{t.template}</div>{t.example && <div className="truncate text-[11.5px] italic text-muted" title={t.example}>from &ldquo;{t.example}&rdquo;</div>}</div>
          <button onClick={() => { navigator.clipboard.writeText(t.template); setCopied(k); setTimeout(() => setCopied(null), 1400); }} className="num flex-none text-[11px] text-muted hover:text-accent">{copied === k ? "copied" : "copy"}</button>
        </li>
      ))}
    </ul>
  );
}
