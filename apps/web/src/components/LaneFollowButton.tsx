"use client";
import { useState } from "react";

/** The creator's version of the watch button. Their lane is theirs: follow anyone, remove anyone.
 *  Removing a manager's pick hides it for them only; the manager keeps the watch. */
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
    if (on) { setOn(false); setBy(j.removed === "muted" ? "muted" : null); } else { setOn(true); setBy(j.unmuted ? addedBy : "creator"); }
  }
  const managers = on && by && by !== "creator";
  const label = busy ? "…" : on ? (managers ? "in your lane · manager's pick · remove" : "in your lane ✓ · unfollow") : by === "muted" ? "hidden from your lane · put back" : "+ follow in your lane";
  const title = on ? (managers ? `${firstName ? firstName + "'s" : "Your"} manager added this creator. Remove hides them from your lane only; your manager keeps the watch.` : "Unfollow: their posts stop feeding your lane") : "Follow: their best posts feed your lane every week";
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={toggle} disabled={busy} className={on ? "!border-ok/40 !text-ok" : ""} title={title}>{label}</button>
      {err && <span className="num text-[11px] text-bad">{err}</span>}
    </span>
  );
}
