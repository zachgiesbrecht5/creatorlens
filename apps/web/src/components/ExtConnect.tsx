"use client";
import { useEffect, useState } from "react";

// Hands the signed-in user's Sponsorprint key to the YouTube extension without copy-paste,
// and shows the Google Sheets formula for their feed. The extension's content script on
// sponsorprint.com says hello on load and listens for the key. The existing key is reused,
// never rotated, so anything else using it keeps working.
type Ext = { version: string; connected: boolean; email?: string | null } | null;

export function ExtConnect({ feedUrl: initialFeed }: { feedUrl: string | null }) {
  const [ext, setExt] = useState<Ext>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [feed, setFeed] = useState<string | null>(initialFeed);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.data?.source !== "sp-yt-ext") return;
      if (e.data.type === "hello" || e.data.type === "connected") setExt({ version: e.data.version, connected: !!e.data.connected, email: e.data.email || null });
      if (e.data.type === "connected") { setBusy(false); setMsg(e.data.ok ? "Extension connected. Open any YouTube channel and look for the Sponsorprint button." : e.data.error || "The extension could not verify the key."); }
    };
    window.addEventListener("message", on);
    window.postMessage({ source: "sp-yt-page", type: "ping" }, window.location.origin);
    return () => window.removeEventListener("message", on);
  }, []);

  async function key(): Promise<string | null> {
    const r = await fetch("/api/ext/key", { method: "POST" }).catch(() => null);
    if (!r || !r.ok) return null;
    const j = await r.json();
    if (j.feed_url) setFeed(j.feed_url);
    return j.key || null;
  }

  async function connect() {
    setBusy(true); setMsg(null);
    const k = await key();
    if (!k) { setBusy(false); setMsg("Could not create a key."); return; }
    window.postMessage({ source: "sp-yt-page", type: "key", key: k }, window.location.origin);
    setTimeout(() => setBusy((b) => { if (b) setMsg("No answer from the extension. Is it installed and enabled? Reload this page after installing."); return false; }), 6000);
  }

  const formula = feed ? `=IMPORTDATA("${feed}")` : null;
  async function copy() {
    if (!formula) return;
    await navigator.clipboard.writeText(formula).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-5 text-[13px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-medium">1. Connect the extension</span>
          {!ext ? <span className="pill pill-warn">not detected</span> : ext.connected ? <span className="pill pill-ok">connected · v{ext.version}</span> : <span className="pill pill-warn">installed · not connected</span>}
        </div>
        {!ext && <span className="text-muted">Install Sponsorprint for YouTube in Chrome, then reload this page.</span>}
        {ext && !ext.connected && <button onClick={connect} disabled={busy} className="btn-dark self-start">{busy ? "Connecting…" : "Connect extension"}</button>}
        {ext?.connected && <button onClick={connect} disabled={busy} className="btn-ghost self-start">Reconnect</button>}
        {msg && <span className="text-muted">{msg}</span>}
      </div>

      <div className="card flex flex-col gap-3 p-5 text-[13px]">
        <span className="text-[15px] font-medium">2. Send every pull to a Google Sheet</span>
        <span className="text-muted">Paste this into cell A1 of an empty tab. Every creator you pull from YouTube lands there, one row per brand. Google re-reads the link about once an hour.</span>
        {formula ? (
          <>
            <code className="block overflow-x-auto whitespace-nowrap rounded-md border border-line bg-surface2 px-3 py-2 font-mono text-[12px]">{formula}</code>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={copy} className="btn-dark">{copied ? "Copied" : "Copy formula"}</button>
              <span className="text-[12px] text-muted">Anyone who can see the sheet can read this feed. Revoking your API key in Settings switches the link off.</span>
            </div>
          </>
        ) : (
          <button onClick={key} className="btn-ghost self-start">Create my sheet link</button>
        )}
      </div>
    </div>
  );
}
