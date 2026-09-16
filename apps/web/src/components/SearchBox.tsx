"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { unlockAudio, playChunk } from "@/lib/print-sound";

type Hit = { platform: "youtube" | "instagram"; handle: string; display_name: string; avatar_url: string | null; followers: number | null; cached: boolean; source?: "index" | "live" };

const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export function SearchBox({ signedIn, cta = "Scan" }: { signedIn: boolean; cta?: string }) {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<"youtube" | "instagram">("youtube");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const [looking, setLooking] = useState(false);
  const liveTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (liveTimer.current) clearTimeout(liveTimer.current);
    if (q.trim().length < 2) { setHits([]); setLooking(false); return; }
    // instant: our index
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&platform=${platform}`);
      if (r.ok) setHits(await r.json());
    }, 150);
    // on pause: ask the platform itself
    liveTimer.current = setTimeout(async () => {
      setLooking(true);
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&platform=${platform}&live=1`);
      if (r.ok) setHits(await r.json());
      setLooking(false);
    }, 650);
  }, [q, platform]);

  async function scan(handle: string, p = platform) {
    unlockAudio(); playChunk();
    setErr("");
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(`/c/${p}/${handle.replace(/^@/, "")}`)}`); return; }
    setBusy(true);
    const r = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform: p, handle }) });
    const j = await r.json();
    setBusy(false);
    if (r.status === 402) { window.location.href = "/pricing"; return; }
    if (!r.ok) { setErr(j.error || "Scan failed"); return; }
    router.push(`/c/${p}/${j.handle}`);
  }

  return (
    <div className="relative text-left">
      <div className="flex items-center gap-2 rounded-lg border border-line2 bg-surface p-1.5 shadow-card transition focus-within:border-accent focus-within:shadow-focus">
        <div className="flex rounded-md bg-surface2 p-0.5 font-mono text-[11px]">
          {(["youtube", "instagram"] as const).map((p) => (
            <button key={p} onClick={() => setPlatform(p)} className={`rounded px-3 py-1.5 transition ${platform === p ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}>
              {p === "youtube" ? "YouTube" : "Instagram"}
            </button>
          ))}
        </div>
        <input
          className="min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-dim"
          placeholder={platform === "youtube" ? "@handle or channel name" : "@username (Business or Creator account)"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) scan(q.trim()); }}
        />
        <button className="btn-primary" disabled={busy || !q.trim()} onClick={() => scan(q.trim())}>
          {busy ? "Queuing…" : cta}
        </button>
      </div>
      {err && <p className="mt-3 text-sm text-bad">{err}</p>}
      {(hits.length > 0 || looking) && (
        <ul className="card absolute z-10 mt-2 w-full overflow-hidden shadow-pop">
          {hits.map((h) => (
            <li key={h.platform + h.handle}>
              <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accentSoft/50" onClick={() => (h.cached ? router.push(`/c/${h.platform}/${h.handle}`) : scan(h.handle, h.platform))}>
                {h.avatar_url ? <img src={h.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-surface2" />}
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{h.display_name || h.handle}</span>
                  <span className="num block truncate text-[11px] text-muted">
                    {h.platform === "youtube" ? <span className="text-[#c4302b]">YouTube</span> : <span className="text-[#b13589]">Instagram</span>}
                    {" · "}{/^UC[A-Za-z0-9_-]{20,}$/.test(h.handle) ? "channel" : `@${h.handle}`}
                    {h.followers != null && <> · {fmtN(h.followers)} {h.platform === "youtube" ? "subscribers" : "followers"}</>}
                  </span>
                </span>
                <span className={`ml-auto shrink-0 ${h.cached ? "pill-ok" : "pill"}`}>{h.cached ? "printed" : "pull the print"}</span>
              </button>
            </li>
          ))}
          {looking && <li className="num flex items-center gap-2 px-4 py-2 text-[11px] text-dim"><span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />looking on {platform === "youtube" ? "YouTube" : "Instagram"}…</li>}
          {!looking && hits.length === 0 && q.length >= 3 && <li className="px-4 py-3 text-[12px] text-muted">Nothing by that name. Try the exact @handle.</li>}
        </ul>
      )}
    </div>
  );
}
