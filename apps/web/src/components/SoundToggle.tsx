"use client";
import { useState } from "react";

/** House-only: flip a top post's opening between "they said it" and "it's a trending sound". Teaches the worker the line. */
export function SoundToggle({ creatorId, url, isSound }: { creatorId: string; url: string; isSound: boolean }) {
  const [sound, setSound] = useState(isSound);
  const [busy, setBusy] = useState(false);
  async function flip(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    setBusy(true);
    const r = await fetch("/api/hooks/sound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creatorId, url, undo: sound }) });
    setBusy(false);
    if (r.ok) { setSound(!sound); window.location.reload(); }
  }
  return <button onClick={flip} disabled={busy} className="num mt-2 text-[10px] text-dim hover:text-accent">{busy ? "saving…" : sound ? "actually, they do say this" : "not them talking (trending sound)"}</button>;
}
