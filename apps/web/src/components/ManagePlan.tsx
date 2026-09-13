"use client";
export function ManagePlan() {
  return <button className="btn-ghost" onClick={async () => { const r = await fetch("/api/billing/portal", { method: "POST" }); const j = await r.json(); if (j.url) window.location.href = j.url; else alert(j.error || "Unavailable"); }}>Manage billing</button>;
}
