"use client";
import { useState } from "react";

export function UpdateReview({ u }: { u: { id: string; subject: string; body: string; status: string; creator: string; email: string | null; month: string } }) {
  const [subject, setSubject] = useState(u.subject || "");
  const [body, setBody] = useState(u.body || "");
  const [status, setStatus] = useState(u.status);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const act = async (action: string) => {
    setBusy(action); setErr(null);
    const r = await fetch("/api/updates", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: u.id, subject, body, action }) });
    const j = await r.json(); setBusy(null);
    if (!r.ok) { setErr(j.error || "failed"); return; }
    setStatus(j.status);
  };
  const done = status === "sent" || status === "skipped";
  return (
    <div className={`card p-5 ${done ? "opacity-70" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><div className="text-[15px] font-semibold tracking-tight">{u.creator}</div><div className="num text-[10.5px] text-muted">{u.month} · to {u.email || "no email on roster"} · <span className={status === "sent" ? "text-ok" : ""}>{status}</span></div></div>
        {!done && <div className="flex gap-2"><button onClick={() => act("skip")} disabled={!!busy} className="btn-ghost !py-1.5 !text-[12px]">skip this month</button><button onClick={() => act("save")} disabled={!!busy} className="btn-ghost !py-1.5 !text-[12px]">{busy === "save" ? "saving…" : "save"}</button><button onClick={() => act("send")} disabled={!!busy || !u.email} className="btn-dark !py-1.5 !text-[12px]">{busy === "send" ? "sending…" : "send from my Gmail"}</button></div>}
      </div>
      {!done && <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input-flat mb-2 font-medium" />}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} readOnly={done} className="input-flat font-mono text-[13px] leading-relaxed" />
      {err && <p className="mt-2 text-[12px] text-bad">{err}</p>}
    </div>
  );
}
