"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";

const MOODS = [{ k: "love", label: "Love it" }, { k: "ok", label: "It's fine" }, { k: "stuck", label: "I'm stuck" }] as const;

// Floating "Feedback / Ask" button on every page. Questions go to a human, not a bot:
// they ping the alert channel and get answered by email.
export function Feedback({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"feedback" | "question">("feedback");
  const [mood, setMood] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setState("sending"); setErr(null);
    const r = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, mood, body, path, email: email || undefined }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setErr(j.error || "Couldn't send, try again"); setState("idle"); return; }
    setState("sent"); setBody(""); setMood(null);
    setTimeout(() => { setOpen(false); setState("idle"); }, 1800);
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-30 rounded-full border border-line bg-surface px-4 py-2 font-mono text-[12px] text-muted shadow-sm hover:border-fg hover:text-fg" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
      Feedback · Ask
    </button>
  );
  return (
    <div className="fixed bottom-5 right-5 z-30 w-[320px] max-w-[calc(100vw-2.5rem)] rounded-xl border border-line bg-surface p-4 shadow-lg" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex items-center justify-between">
        <div className="flex gap-1 font-mono text-[11px]">
          {(["feedback", "question"] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={`rounded px-2 py-0.5 ${kind === k ? "bg-fg text-white" : "text-muted hover:text-fg"}`}>{k === "feedback" ? "Feedback" : "Ask a question"}</button>)}
        </div>
        <button onClick={() => setOpen(false)} className="text-dim hover:text-fg" aria-label="Close">✕</button>
      </div>
      {state === "sent" ? (
        <p className="py-6 text-center text-[13px]">{kind === "question" ? "Got it. A real person will email you back, usually the same day." : "Thank you. Every note gets read."}</p>
      ) : (
        <>
          {kind === "feedback" && (
            <div className="mt-3 flex gap-1.5">
              {MOODS.map((m) => <button key={m.k} onClick={() => setMood(m.k)} className={`flex-1 rounded-md border px-2 py-1.5 text-[12px] ${mood === m.k ? "border-fg bg-surface2" : "border-line text-muted hover:border-fg"}`}>{m.label}</button>)}
            </div>
          )}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder={kind === "question" ? "What can we help with?" : mood === "stuck" ? "Where did you get stuck?" : "What would make this better?"}
            className="mt-3 w-full resize-none rounded-md border border-line bg-transparent p-2 text-[13px] outline-none focus:border-fg" />
          {!signedIn && <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={kind === "question" ? "Your email (so we can answer)" : "Email (optional)"} className="mt-2 w-full rounded-md border border-line bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-fg" />}
          <button onClick={send} disabled={state === "sending" || (!mood && !body.trim())} className="btn-dark mt-3 w-full justify-center disabled:opacity-50">{state === "sending" ? "Sending…" : "Send"}</button>
          {err && <p className="mt-2 text-center text-[11px] text-bad">{err}</p>}
        </>
      )}
    </div>
  );
}
