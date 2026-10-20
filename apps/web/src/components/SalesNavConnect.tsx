"use client";
import { useEffect, useState } from "react";

// Hands the admin's Sponsorprint key to the Sales Nav extension without copy-paste.
// The extension's content script on sponsorprint.com/salesnav says hello on load and
// listens for SP_SALESNAV_KEY. The existing key is reused, never rotated, so anything
// else using it (the outreach skills) keeps working.
type Ext = { version: string; connected: boolean; email?: string | null } | null;

export function SalesNavConnect({ hasKey }: { hasKey: boolean }) {
  const [ext, setExt] = useState<Ext>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.data?.source !== "sp-salesnav-ext") return;
      if (e.data.type === "hello" || e.data.type === "connected") setExt({ version: e.data.version, connected: !!e.data.connected, email: e.data.email || null });
      if (e.data.type === "connected") { setBusy(false); setMsg(e.data.ok ? "Extension connected." : e.data.error || "The extension could not verify the key."); }
    };
    window.addEventListener("message", on);
    window.postMessage({ source: "sp-salesnav-page", type: "ping" }, window.location.origin);
    return () => window.removeEventListener("message", on);
  }, []);

  async function connect() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/salesnav/key", { method: "POST" }).catch(() => null);
    const key: string | null = r && r.ok ? (await r.json()).key || null : null;
    if (!key) { setBusy(false); setMsg("Could not create a key."); return; }
    window.postMessage({ source: "sp-salesnav-page", type: "key", key, origin: window.location.origin }, window.location.origin);
    setTimeout(() => setBusy((b) => { if (b) setMsg("No answer from the extension. Is it installed and enabled? Reload this page after installing."); return false; }), 6000);
  }

  return (
    <div className="card flex min-w-[280px] flex-col gap-2 p-4 text-[13px]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">Chrome extension</span>
        {!ext ? <span className="pill pill-warn">not detected</span> : ext.connected ? <span className="pill pill-ok">connected · v{ext.version}</span> : <span className="pill pill-warn">installed · not connected</span>}
      </div>
      {ext && !ext.connected && <button onClick={connect} disabled={busy} className="btn-dark !py-1.5 !text-[12px]">{busy ? "Connecting…" : hasKey ? "Connect extension" : "Create key and connect"}</button>}
      {ext?.connected && <button onClick={connect} disabled={busy} className="btn-ghost !py-1.5 !text-[12px]">Reconnect</button>}
      {!ext && <span className="text-[12px] text-muted">Install the Sponsorprint Sales Nav extension, then reload this page.</span>}
      {msg && <span className="text-[12px] text-muted">{msg}</span>}
    </div>
  );
}
