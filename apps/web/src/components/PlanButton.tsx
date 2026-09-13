"use client";
import { useState } from "react";

export function PlanButton({ plan, signedIn, current }: { plan: "pro" | "agency"; signedIn: boolean; current: boolean }) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (current) return <a href="/settings" className="btn-ghost w-full justify-center">Manage in Settings</a>;
  if (!signedIn) return <a href={`/login?next=/pricing`} className="btn-dark w-full justify-center">Sign in to start</a>;
  async function go() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, interval }) });
    const j = await r.json();
    if (!r.ok || !j.url) { setErr(j.error || "Checkout failed"); setBusy(false); return; }
    window.location.href = j.url;
  }
  return (
    <div>
      <div className="mb-2 flex justify-center gap-1 font-mono text-[11px]">
        {(["monthly", "yearly"] as const).map((i) => <button key={i} onClick={() => setInterval(i)} className={`rounded px-2 py-0.5 ${interval === i ? "bg-fg text-white" : "text-muted hover:text-fg"}`}>{i === "yearly" ? "yearly · 2 months free" : "monthly"}</button>)}
      </div>
      <button onClick={go} disabled={busy} className="btn-dark w-full justify-center">{busy ? "Opening checkout…" : `Start ${plan === "pro" ? "Pro" : "Agency"}`}</button>
      {err && <p className="mt-2 text-center text-[11px] text-bad">{err}</p>}
    </div>
  );
}
