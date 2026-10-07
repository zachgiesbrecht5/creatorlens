"use client";
import { useState } from "react";

/** The creator's version of the watch button. Their lane is theirs: follow anyone, unfollow their own picks.
 *  A manager's pick stays (the manager removes it from the Watchlist page). */
export function LaneFollowButton({ platform, handle, initial, addedBy, firstName }: { platform: string; handle: string; initial: boolean; addedBy: string | null; firstName?: string }) {
  const [on, setOn] = useState(initial);
  const [by, setBy] = useState<string | null>(addedBy);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function toggle() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/me/watch", { method: on ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform, handle }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error || "failed"); return; }
    if (on) { setOn(false); setBy(null); } else { setOn(true); setBy("creator"); }
  }
  if (on && by && by !== "creator") return <button disabled className="!border-ok/40 !text-ok" title={`${firstName ? firstName + "'s" : "Your"} manager added this creator to the lane. Ask them to remove it.`}>in your lane · manager's pick</button>;
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={toggle} disabled={busy} className={on ? "!border-ok/40 !text-ok" : ""} title={on ? "Unfollow: their posts stop feeding your lane" : "Follow: their best posts feed your lane every week"}>{busy ? "…" : on ? "in your lane ✓ · unfollow" : "+ follow in your lane"}</button>
      {err && <span className="num text-[11px] text-bad">{err}</span>}
    </span>
  );
}
