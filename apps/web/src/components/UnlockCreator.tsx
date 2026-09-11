"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Outsider view of a creator that someone else scanned: the wall is hidden
// until they scan it themselves (free if it's fresh in the index).
export function UnlockCreator({ platform, handle, signedIn, brands }: { platform: string; handle: string; signedIn: boolean; brands: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function unlock() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform, handle }) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error || "Could not scan"); setBusy(false); return; }
    router.refresh();
  }
  return (
    <div className="card mt-6 p-8 text-center">
      <div className="label mb-2">Locked</div>
      <h2 className="h2 text-xl">{brands} brand{brands === 1 ? "" : "s"} found for @{handle}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        Scan this creator to see every sponsor, the post that proves each deal, and the contact behind each brand. Recently indexed creators cost nothing.
      </p>
      {signedIn ? (
        <button onClick={unlock} disabled={busy} className="btn-primary mt-6">{busy ? "Scanning…" : "Scan and unlock"}</button>
      ) : (
        <a href={`/login?next=/c/${platform}/${encodeURIComponent(handle)}`} className="btn-primary mt-6 inline-flex">Sign in to scan</a>
      )}
      {err && <p className="mt-3 font-mono text-[11px] text-bad">{err}</p>}
    </div>
  );
}
