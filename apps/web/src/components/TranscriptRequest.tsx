"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TranscriptRequest() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault(); if (!handle.trim() || busy) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/transcripts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error || "That did not work"); return; }
    setMsg(j.already ? "Already running for that creator." : "Queued. Reels appear below as they are heard.");
    setHandle(""); router.refresh();
  }
  return (
    <form onSubmit={go} className="flex flex-wrap items-center gap-2">
      <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle or Instagram link" className="w-72 rounded-md border border-line bg-white px-3 py-2 text-[14px] outline-none focus:border-fg" />
      <button disabled={busy} className="rounded-md bg-fg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50">{busy ? "Queuing…" : "Transcribe every reel"}</button>
      {msg && <span className="text-[13px] text-muted">{msg}</span>}
    </form>
  );
}
