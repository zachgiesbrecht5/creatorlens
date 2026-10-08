"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = { platform: "youtube" | "instagram"; handle: string; display_name: string; avatar_url: string | null; followers: number | null; cached: boolean; source?: "index" | "live" };
const fmtN = (n: number | null) => (!n ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/** The creator's own scanner. Type a handle, pick the account, and Sponsorprint follows it in their lane and
 *  prints it (free, no credit), then opens the print: top posts, what was said first, brands. Already printed
 *  accounts open at once. Suggestions come from the index instantly and from the platform after a pause. */
export function LaneSearch({ platform: initial, onFollowed, compact = false, autoFocus = false }: { platform: string; onFollowed?: (r: { platform: string; handle: string; name: string | null; avatar: string | null; followers: number | null }) => void; compact?: boolean; autoFocus?: boolean }) {
  const [q, setQ] = useState(""); const [platform, setPlatform] = useState<"youtube" | "instagram">(initial === "youtube" ? "youtube" : "instagram");
  const [hits, setHits] = useState<Hit[]>([]); const [looking, setLooking] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter(); const t1 = useRef<ReturnType<typeof setTimeout>>(); const t2 = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (t1.current) clearTimeout(t1.current); if (t2.current) clearTimeout(t2.current);
    const s = q.trim().replace(/^@/, ""); if (s.length < 2 || /instagram\.com|youtube\.com/.test(s)) { setHits([]); setLooking(false); return; }
    t1.current = setTimeout(async () => { const r = await fetch(`/api/search?q=${encodeURIComponent(s)}&platform=${platform}`); if (r.ok) setHits(await r.json()); }, 150);
    t2.current = setTimeout(async () => { setLooking(true); const r = await fetch(`/api/search?q=${encodeURIComponent(s)}&platform=${platform}&live=1`); if (r.ok) setHits(await r.json()); setLooking(false); }, 650);
  }, [q, platform]);
  async function go(handle: string, p: "youtube" | "instagram" = platform, cached = false) {
    setBusy(true); setMsg(null); setHits([]);
    const r = await fetch("/api/me/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform: p, handle }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.error || "Couldn't add them"); return; }
    onFollowed?.({ platform: p, handle: j.handle, name: j.name || null, avatar: j.avatar || null, followers: j.followers || null });
    setQ("");
    setMsg(cached || j.name ? "Opening their print…" : "Printing now; their page fills in over the next few minutes.");
    router.push(`/c/${p}/${j.handle}`);
  }
  return (
    <div className="relative text-left">
      <div className={`flex items-center gap-2 rounded-lg border border-line2 bg-surface shadow-card transition focus-within:border-accent ${compact ? "p-1" : "p-1.5"}`}>
        <div className="seg"><button className={platform === "instagram" ? "on" : ""} onClick={() => setPlatform("instagram")}>Instagram</button><button className={platform === "youtube" ? "on" : ""} onClick={() => setPlatform("youtube")}>YouTube</button></div>
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} placeholder="@handle or profile link" className={`min-w-0 flex-1 bg-transparent px-2 font-mono outline-none placeholder:text-dim ${compact ? "text-[13px]" : "text-[14px]"}`} onKeyDown={(e) => e.key === "Enter" && q.trim() && go(q.trim())} />
        <button onClick={() => q.trim() && go(q.trim())} disabled={busy || !q.trim()} className="btn-dark !py-1.5 !text-[12.5px] disabled:opacity-50">{busy ? "…" : "scan"}</button>
      </div>
      {msg && <div className="num mt-1.5 text-[11px] text-muted">{msg}</div>}
      {(hits.length > 0 || looking) && (
        <ul className="card absolute z-10 mt-2 w-full overflow-hidden shadow-pop">
          {hits.slice(0, 6).map((h) => (
            <li key={h.platform + h.handle}>
              <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accentSoft/50" onClick={() => go(h.handle, h.platform, h.cached)}>
                {h.avatar_url ? <img src={h.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-surface2" />}
                <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{h.display_name || h.handle}</span><span className="num block text-[10.5px] text-muted">@{h.handle}{h.followers ? ` · ${fmtN(h.followers)}` : ""}{h.cached ? " · printed, opens now" : " · prints in a few minutes"}</span></span>
              </button>
            </li>))}
          {looking && <li className="num px-4 py-2 text-[10.5px] text-dim">asking {platform === "youtube" ? "YouTube" : "Instagram"}…</li>}
        </ul>
      )}
    </div>
  );
}
