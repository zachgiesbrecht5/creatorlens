"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; title: string; url: string; published_at: string; views: number; kind: string; sponsored: boolean; mult: number | null; climbing: boolean; words: number; tags: string[] };
type Pattern = { key: string; label: string; hint: string; with_n: number; without_n: number; with_mult: number | null; without_mult: number | null; lift: number | null; examples: string[] };
type Reading = { summary: string; winning: { name: string; why: string; examples: string[] }[]; weak: { name: string; why: string; examples: string[] }[]; rules: string[]; avoid: string[]; feedback: string } | null;
export type Lab = { status: string; error: string | null; items: Item[]; items_n: number; median_video: number | null; median_short: number | null; patterns: Pattern[]; reading: Reading; finished_at: string | null } | null;

const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const when = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", year: "numeric" });

/** Run / re-run control with polling. The page re-renders itself when the worker finishes. */
export function TitleLabRun({ creatorId, lab, canRun, firstName }: { creatorId: string; lab: Lab; canRun: boolean; firstName: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(lab?.status || "none");
  const [err, setErr] = useState<string | null>(null);
  const busy = status === "queued" || status === "running";
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/titlelab?creatorId=${creatorId}`).then((x) => x.json()).catch(() => null);
      if (r?.status && r.status !== status) { setStatus(r.status); if (r.status === "done" || r.status === "failed") { clearInterval(t); router.refresh(); } }
    }, 2500);
    return () => clearInterval(t);
  }, [busy, creatorId, status, router]);
  async function go(force: boolean) {
    setErr(null);
    const r = await fetch("/api/titlelab", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creatorId, force }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 402) { window.location.href = "/pricing"; return; }
    if (!r.ok) { setErr(j.error || "Couldn't start"); return; }
    if (j.fresh) { setErr("This read is under a week old. Use re-read to force a fresh one."); return; }
    setStatus(j.status || "queued");
  }
  const age = lab?.finished_at ? Math.round((Date.now() - new Date(lab.finished_at).getTime()) / 864e5) : null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {busy ? (
        <span className="num text-[12px] text-muted"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" /> reading {firstName}&apos;s titles… (about 20 seconds)</span>
      ) : lab?.status === "done" ? (
        <>
          <span className="num text-[11px] text-muted">read {age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`} · {lab.items_n} videos</span>
          {canRun && <button onClick={() => go(true)} className="btn-like">re-read ↻</button>}
        </>
      ) : (
        canRun ? <button onClick={() => go(false)} className="btn-like">{lab?.status === "failed" ? "try again" : "read the titles →"}</button> : <span className="text-[12px] text-muted">Not read yet.</span>
      )}
      {err && <span className="text-[12px] text-bad">{err}</span>}
      {lab?.status === "failed" && lab.error && !busy && <span className="text-[12px] text-bad">{lab.error}</span>}
    </div>
  );
}

/** Pattern lift table. Bars are the median multiple with vs without; lift is the ratio. */
export function PatternTable({ patterns }: { patterns: Pattern[] }) {
  const rows = patterns.filter((p) => p.lift != null);
  const thin = patterns.filter((p) => p.lift == null && p.with_n > 0);
  if (!rows.length) return <p className="text-[13px] text-muted">Not enough titles on both sides of any pattern yet (needs 3 with and 3 without). The read below still works from the top and bottom titles.</p>;
  const max = Math.max(...rows.flatMap((p) => [p.with_mult || 0, p.without_mult || 0]), 1);
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_64px] items-center gap-x-3 gap-y-1.5 text-[12.5px]">
        <div className="label">pattern</div><div className="label">median multiple · with vs without</div><div className="label text-right">lift</div>
        {rows.map((p) => (
          <div key={p.key} className="contents">
            <div className="min-w-0"><div className="truncate font-medium text-fg" title={p.hint}>{p.label}</div><div className="num text-[10.5px] text-muted">{p.with_n} with · {p.without_n} without</div></div>
            <div className="space-y-[3px]">
              <div className="flex items-center gap-2"><div className="h-[9px] rounded-sm bg-accent" style={{ width: `${Math.max(2, ((p.with_mult || 0) / max) * 100)}%` }} /><span className="num text-[10.5px] text-muted">{p.with_mult}x</span></div>
              <div className="flex items-center gap-2"><div className="h-[9px] rounded-sm bg-line" style={{ width: `${Math.max(2, ((p.without_mult || 0) / max) * 100)}%` }} /><span className="num text-[10.5px] text-muted">{p.without_mult}x</span></div>
            </div>
            <div className={`num text-right text-[15px] font-semibold ${(p.lift || 0) >= 1.3 ? "text-ok" : (p.lift || 0) <= 0.75 ? "text-bad" : "text-fg"}`}>{p.lift}x</div>
          </div>
        ))}
      </div>
      {thin.length > 0 && <p className="mt-3 text-[11px] text-muted">Too few titles to measure: {thin.map((p) => `${p.label} (${p.with_n})`).join(", ")}.</p>}
    </div>
  );
}

export function TitleRow({ i, rank, kindMedian }: { i: Item; rank?: number; kindMedian: number | null }) {
  return (
    <a href={i.url} target="_blank" rel="noreferrer" className={`flex items-start gap-3 rounded-lg border border-line border-l-[3px] p-2.5 hover:border-fg ${i.sponsored ? "border-l-[#0e6b45]" : ""}`}>
      <div className="num w-[64px] flex-none">
        {rank != null && <div className="text-[10px] text-muted">#{rank}</div>}
        <div className="text-[15px] font-semibold leading-tight text-fg">{i.mult != null ? `${i.mult}x` : "–"}</div>
        <div className="text-[10.5px] text-muted">{fmtN(i.views)} views</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold leading-snug text-fg">{i.title}</div>
        <div className="num mt-1 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted">
          <span>{when(i.published_at)} · {i.kind}{i.sponsored ? " · sponsored" : ""}{i.climbing ? " · still climbing" : ""} · {i.words} words</span>
          {i.tags.filter((t) => !["short", "long", "named"].includes(t)).slice(0, 4).map((t) => <span key={t} className="rounded border border-line px-1 py-[0px] text-[9.5px] uppercase tracking-wide">{t.replace(/_/g, " ")}</span>)}
        </div>
      </div>
      {kindMedian != null && <div className="num hidden w-[72px] flex-none text-right text-[10px] text-muted sm:block">median {fmtN(kindMedian)}</div>}
    </a>
  );
}

/** Paste a draft title, get three alternatives in this channel's own patterns. */
export function TitleRewriter({ creatorId, disabled }: { creatorId: string; disabled: boolean }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<{ options: { title: string; pattern: string; why: string }[]; note: string } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  async function go() {
    if (!draft.trim()) return;
    setBusy(true); setErr(null); setOut(null);
    const r = await fetch("/api/titlelab/rewrite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creatorId, draft }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 402) { window.location.href = "/pricing"; return; }
    if (!r.ok) { setErr(j.error || "Couldn't rewrite"); return; }
    setOut(j);
  }
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} maxLength={200} disabled={disabled} placeholder={disabled ? "Run the read first" : "Paste the working title for the next upload…"} className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-fg placeholder:text-muted focus:border-fg focus:outline-none disabled:opacity-50" />
        <button onClick={go} disabled={busy || disabled || !draft.trim()} className="btn-like whitespace-nowrap disabled:opacity-50">{busy ? "writing…" : "try 3 alternatives →"}</button>
      </div>
      {err && <p className="mt-2 text-[12px] text-bad">{err}</p>}
      {out && (
        <div className="mt-3 space-y-2">
          {out.note && <p className="text-[12.5px] text-muted">{out.note}</p>}
          {out.options.map((o, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-line p-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-semibold leading-snug text-fg">{o.title}</div>
                <div className="mt-1 text-[12px] text-muted"><span className="rounded bg-accent px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wide text-white">{o.pattern}</span> <span className="ml-1">{o.why}</span></div>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(o.title); setCopied(i); setTimeout(() => setCopied(null), 1500); }} className="num flex-none text-[11px] text-muted hover:text-accent">{copied === i ? "copied" : "copy"}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The manager's note to the creator, with copy. */
export function FeedbackNote({ text, firstName }: { text: string; firstName: string }) {
  const [copied, setCopied] = useState(false);
  const full = `Hi ${firstName},\n\n${text}`;
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between"><div className="label">note to {firstName}</div><button onClick={() => { navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="num text-[11px] text-muted hover:text-accent">{copied ? "copied" : "copy note"}</button></div>
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-fg">{text}</p>
    </div>
  );
}
