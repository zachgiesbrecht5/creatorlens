"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Add a roster creator from just a handle: we look them up on the platform
// and fill name, followers, avatar and bio. Manual entry stays below for
// multi-platform creators or ones we can't look up.
export function QuickAdd() {
  const [platform, setPlatform] = useState<"instagram" | "youtube">("instagram");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  async function add() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/roster", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform, handle }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error || "Couldn't add" }); return; }
    setHandle("");
    setMsg({ ok: true, text: j.existed ? `${j.creator.name} was already on your roster; details refreshed.` : `Added ${j.creator.name}${j.creator.followers ? ` (${Intl.NumberFormat().format(j.creator.followers)} ${platform === "youtube" ? "subscribers" : "followers"})` : ""}.` });
    router.refresh();
  }
  return (
    <div className="rounded-lg border border-line bg-surface2/60 p-4">
      <div className="label mb-2">Quick add</div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md bg-surface p-0.5 font-mono text-[12px] shadow-card">
          {(["instagram", "youtube"] as const).map((p) => <button key={p} type="button" onClick={() => setPlatform(p)} className={`rounded px-3 py-1.5 ${platform === p ? "bg-fg text-white" : "text-muted hover:text-fg"}`}>{p === "youtube" ? "YouTube" : "Instagram"}</button>)}
        </div>
        <input value={handle} onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handle.trim() && add()} placeholder={platform === "youtube" ? "@channel" : "@username"} className="input-flat !w-60 font-mono" />
        <button type="button" onClick={add} disabled={busy || !handle.trim()} className="btn-dark">{busy ? "Looking up…" : "Look up and add"}</button>
        <span className="text-[12px] text-muted">Name, size, photo and bio fill in from the platform. Add the pitch angle after.</span>
      </div>
      {msg && <p className={`mt-2 text-[12px] ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
