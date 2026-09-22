"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// First-party pageview beacon: one tiny POST per route change.
export function Beacon() {
  const path = usePathname();
  useEffect(() => {
    if (!path || (navigator as any).webdriver) return;
    let a = "";
    try { a = localStorage.getItem("sp_a") || ""; if (!a) { a = crypto.randomUUID(); localStorage.setItem("sp_a", a); } } catch { a = "nostore"; }
    const body = JSON.stringify({ a, p: path, r: document.referrer || "" });
    try { navigator.sendBeacon?.("/api/t", new Blob([body], { type: "application/json" })) || fetch("/api/t", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }); } catch {}
  }, [path]);
  return null;
}
