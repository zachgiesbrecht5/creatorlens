"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function NeighborsButton({ creatorId }: { creatorId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button disabled={busy} onClick={async () => { setBusy(true); const r = await fetch("/api/neighborhood", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creatorId }) }); const j = await r.json(); setBusy(false); if (r.ok) router.push(`/n/${j.id}`); }} className="hover:text-accent disabled:opacity-50" title="Find three creators next to this one and print them, free">{busy ? "finding…" : "neighbors ◎"}</button>
  );
}
