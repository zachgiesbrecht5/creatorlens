"use client";
import { useState } from "react";

/** "Share with creators": a read-only link to this brand page. No sign-in, no contacts, no pitch history. */
export function ShareBrand({ brandId, initialToken, views }: { brandId: string; initialToken: string | null; views: number }) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/brand/${token}` : "";
  async function make() {
    setBusy(true);
    const r = await fetch(`/api/brands/${brandId}/share`, { method: "POST" }); const j = await r.json(); setBusy(false);
    if (j.token) { setToken(j.token); copy(`${window.location.origin}/share/brand/${j.token}`); }
  }
  async function off() {
    setBusy(true); await fetch(`/api/brands/${brandId}/share`, { method: "DELETE" }); setBusy(false); setToken(null);
  }
  function copy(u = url) { navigator.clipboard?.writeText(u).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}); }
  if (!token) return <button onClick={make} disabled={busy} className="btn-ghost !py-1.5 !text-[12px]">{busy ? "making link…" : "Share with creators"}</button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="num w-64 rounded-md border border-line bg-surface2 px-2 py-1 text-[11px]" />
      <button onClick={() => copy()} className="btn-dark !py-1 !text-[11.5px]">{copied ? "copied" : "copy link"}</button>
      <a href={url} target="_blank" rel="noreferrer" className="num text-[11px] text-muted hover:text-accent">preview ↗</a>
      <button onClick={off} disabled={busy} className="num text-[11px] text-dim hover:text-bad">turn off link</button>
      <span className="num w-full text-[10px] text-muted">Anyone with the link sees who this brand books, the timeline and launches. Never contacts or pitch history.{views ? ` Opened ${views}×.` : ""}</span>
    </div>
  );
}
