"use client";
import { useState } from "react";
import Link from "next/link";
import type { RosterCreator } from "./BrandWall";

export type ContactInfo = {
  contacts: { id: string; name: string | null; email: string | null; title: string | null; source: string; verified: boolean }[];
  history: { status: string; created_at: string; creator_handle: string | null; by: string | null }[];
  excluded: boolean;
  domain?: string | null;
};

// The scanned creator is the EVIDENCE (this brand books creators like them).
// The pitch is written for one of the user's own roster creators.
export function ContactCard({ brandId, brand, creator, roster, info, expanded, onLoad }: {
  brandId: string; brand: string; creator: { id: string; handle: string; platform: string; displayName: string };
  roster: RosterCreator[]; info?: ContactInfo | "loading"; expanded: boolean; onLoad: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [rosterId, setRosterId] = useState<string>(roster[0]?.id || "");
  const [drafting, setDrafting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; link?: string } | null>(null);
  const [manual, setManual] = useState("");

  if (!info) return <button className="font-mono text-[11px] text-dim hover:text-fg" onClick={onLoad}>hover for contact</button>;
  if (info === "loading") return <div className="font-mono text-[11px] text-dim">finding contact…</div>;

  const contact = info.contacts.find((c) => c.id === picked) || info.contacts[0];
  const lastPitch = info.history[0];
  const pitched = roster.find((r) => r.id === rosterId);

  async function draft() {
    setDrafting(true); setResult(null);
    const r = await fetch("/api/draft", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ brandId, creatorId: creator.id, rosterCreatorId: rosterId, contactId: contact?.id, toEmail: contact?.email || manual }),
    });
    const j = await r.json();
    setDrafting(false);
    setResult(r.ok ? { ok: true, msg: "Draft is in your Gmail.", link: j.link } : { ok: false, msg: j.error || "Draft failed" });
  }

  return (
    <div className="text-sm">
      {info.excluded && <div className="mb-2 rounded-lg border border-bad/40 px-3 py-1.5 font-mono text-[11px] text-bad">Excluded: do not pitch</div>}
      {lastPitch && (
        <div className={`mb-2 rounded-lg border px-3 py-1.5 font-mono text-[11px] ${lastPitch.status === "replied" ? "border-ok/40 text-ok" : "border-warn/40 text-warn"}`}>
          Pitched {new Date(lastPitch.created_at).toLocaleDateString()}{lastPitch.by ? ` by ${lastPitch.by}` : ""}{lastPitch.creator_handle ? ` for @${lastPitch.creator_handle}` : ""} · {lastPitch.status}{lastPitch.status === "replied" ? " · has replied before" : ""}
        </div>
      )}
      {contact ? (
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{contact.name || "Partnerships"}</span>
          {contact.title && <span className="text-muted">{contact.title}</span>}
          <a href={`mailto:${contact.email}`} className="text-muted underline decoration-line hover:text-fg">{contact.email}</a>
          {contact.verified && <span className="font-mono text-[10px] text-ok" title="Verified deliverable">✓</span>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-muted">No contact on file{info.domain ? ` for ${info.domain}` : ""}.</span>
          {expanded && <input className="input-flat !w-48 !py-1" placeholder="paste an email" value={manual} onChange={(e) => setManual(e.target.value)} />}
        </div>
      )}
      {expanded && info.contacts.length > 1 && (
        <select className="input-flat mt-2 !py-1" value={contact?.id} onChange={(e) => setPicked(e.target.value)}>
          {info.contacts.map((c) => <option key={c.id} value={c.id}>{c.name || c.email} {c.title ? `(${c.title})` : ""}</option>)}
        </select>
      )}

      {roster.length === 0 ? (
        <div className="mt-3 font-mono text-[11px] text-muted">
          Add the creators you represent in <Link href="/settings#roster" className="underline hover:text-fg">Settings</Link> to draft pitches.
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {roster.length > 1 ? (
            <select className="input-flat !w-auto !py-1.5 font-mono text-[11px]" value={rosterId} onChange={(e) => setRosterId(e.target.value)} title="Which of your creators to pitch">
              {roster.map((r) => <option key={r.id} value={r.id}>{r.name}{r.handle ? ` (${r.handle.replace(/^@/, "@")})` : ""}</option>)}
            </select>
          ) : null}
          <button className="btn-primary !px-4 !py-1.5" disabled={drafting || info.excluded || !rosterId || (!contact?.email && !manual)} onClick={draft}>
            {drafting ? "Writing…" : `Pitch ${pitched?.name || "creator"} to ${brand}`}
          </button>
          {result && (
            <span className={`font-mono text-[11px] ${result.ok ? "text-ok" : "text-bad"}`}>
              {result.msg} {result.link && <a className="underline" href={result.link} target="_blank" rel="noreferrer">open</a>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
