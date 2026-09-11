"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = { platform: "youtube" | "instagram"; handle: string; display_name: string; avatar_url: string; followers: number; cached: boolean };

export function SearchBox({ signedIn, cta = "Scan" }: { signedIn: boolean; cta?: string }) {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<"youtube" | "instagram">("youtube");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (r.ok) setHits(await r.json());
    }, 200);
  }, [q]);

  async function scan(handle: string, p = platform) {
    setErr("");
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(`/c/${p}/${handle.replace(/^@/, "")}`)}`); return; }
    setBusy(true);
    const r = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform: p, handle }) });
    const j = await r.json();
    setBusy(false);
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
      {hits.length > 0 && (
        <ul className="card absolute z-10 mt-2 w-full overflow-hidden shadow-pop">
          {hits.map((h) => (
            <li key={h.platform + h.handle}>
              <button className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-accentSoft/50" onClick={() => (h.cached ? router.push(`/c/${h.platform}/${h.handle}`) : scan(h.handle, h.platform))}>
                {h.avatar_url ? <img src={h.avatar_url} alt="" className="h-7 w-7 rounded-full" /> : <div className="h-7 w-7 rounded-full bg-surface2" />}
                <span className="text-sm font-medium">{h.display_name || h.handle}</span>
                <span className="num text-[10px] text-dim">@{h.handle} · {h.platform === "youtube" ? "YT" : "IG"}</span>
                <span className={`ml-auto ${h.cached ? "pill-ok" : "pill"}`}>{h.cached ? "indexed" : "new scan"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
