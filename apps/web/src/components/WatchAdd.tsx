"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
// Add creators to a watchlist by handle, no print needed. Several at once; each gets a low-priority print later.
export function WatchAdd({ roster, defaultFor = "", compact = false }: { roster: { id: string; name: string }[]; defaultFor?: string; compact?: boolean }) {
  const [platform, setPlatform] = useState<"instagram" | "youtube">("instagram");
  const [text, setText] = useState(""); const [forId, setForId] = useState(defaultFor); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  async function add() {
    const handles = [...new Set(text.split(/[\s,]+/).map((h) => h.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(instagram\.com|youtube\.com)\/(@)?/, "").replace(/\/.*$/, "").toLowerCase()).filter(Boolean))];
    if (!handles.length) return;
    setBusy(true); setMsg(null);
    let ok = 0, queued = 0, fail: string | null = null;
    for (const handle of handles) {
      const r = await fetch("/api/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform, handle, rosterCreatorId: forId || null }) });
      const j = await r.json(); if (r.ok) { ok++; if (j.queued) queued++; } else fail = j.error || "failed";
    }
    setBusy(false); setText("");
    setMsg(fail ? fail : `${ok} added${queued ? `, ${queued} will print when Instagram's hour frees up` : ""}.`);
    router.refresh();
  }
  return (
    <div className={`card ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="seg"><button className={platform === "instagram" ? "on" : ""} onClick={() => setPlatform("instagram")}>Instagram</button><button className={platform === "youtube" ? "on" : ""} onClick={() => setPlatform("youtube")}>YouTube</button></div>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="@handle, @handle, @handle" className="input-flat !w-80 !py-1.5 font-mono text-[13px]" onKeyDown={(e) => e.key === "Enter" && add()} />
        {roster.length > 0 && <select value={forId} onChange={(e) => setForId(e.target.value)} className="input-flat !w-auto !py-1.5 font-mono text-[11px]"><option value="">general watchlist</option>{roster.map((r) => <option key={r.id} value={r.id}>for {r.name}</option>)}</select>}
        <button onClick={add} disabled={busy || !text.trim()} className="btn-dark !py-1.5 !text-[12px] disabled:opacity-50">{busy ? "adding…" : "watch"}</button>
        {msg && <span className="num text-[11px] text-muted">{msg}</span>}
      </div>
      {!compact && <div className="num mt-2 text-[10.5px] text-dim">No print needed now. Paste a few handles at once; they print in the background and their hooks and brands show up when done.</div>}
    </div>
  );
}
