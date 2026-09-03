"use client";
import { useState } from "react";

export type ContactInfo = {
  contacts: { id: string; name: string | null; email: string | null; title: string | null; source: string; verified: boolean }[];
  history: { status: string; created_at: string; creator_handle: string | null; by: string | null }[];
  excluded: boolean;
  domain?: string | null;
};

export function ContactCard({ brandId, brand, creator, info, expanded, onLoad }: {
  brandId: string; brand: string; creator: { id: string; handle: string; platform: string; displayName: string };
  info?: ContactInfo | "loading"; expanded: boolean; onLoad: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; link?: string } | null>(null);
  const [manual, setManual] = useState("");

  if (!info) return <button className="text-xs text-slate-500 hover:text-brand" onClick={onLoad}>hover for contact</button>;
  if (info === "loading") return <div className="text-xs text-slate-400">finding contact…</div>;

  const contact = info.contacts.find((c) => c.id === picked) || info.contacts[0];
  const lastPitch = info.history[0];

  async function draft() {
    setDrafting(true); setResult(null);
    const r = await fetch("/api/draft", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ brandId, creatorId: creator.id, contactId: contact?.id, toEmail: contact?.email || manual }),
    });
    const j = await r.json();
    setDrafting(false);
    setResult(r.ok ? { ok: true, msg: "Draft is in your Gmail.", link: j.link } : { ok: false, msg: j.error || "Draft failed" });
  }

  return (
    <div className="text-xs">
      {info.excluded && <div className="mb-1 rounded bg-red-50 px-2 py-1 text-red-700">EXCLUDED: do not pitch (on your team's exclusion list)</div>}
      {lastPitch && (
        <div className={`mb-1 rounded px-2 py-1 ${lastPitch.status === "replied" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          Pitched {new Date(lastPitch.created_at).toLocaleDateString()} {lastPitch.by ? `by ${lastPitch.by}` : ""}{lastPitch.creator_handle ? ` for @${lastPitch.creator_handle}` : ""} · {lastPitch.status}{lastPitch.status === "replied" ? " (has replied before!)" : ""}
        </div>
      )}
      {contact ? (
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium text-ink">{contact.name || "Partnerships"}</span>
          {contact.title && <span className="text-slate-500">{contact.title}</span>}
          <a href={`mailto:${contact.email}`} className="text-brand hover:underline">{contact.email}</a>
          <span className="text-slate-400">via {contact.source}{contact.verified ? " ✓" : ""}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-slate-500">No contact on file{info.domain ? ` for ${info.domain}` : ""}.</span>
          {expanded && <input className="input !w-48 !py-1" placeholder="paste an email" value={manual} onChange={(e) => setManual(e.target.value)} />}
        </div>
      )}
      {expanded && info.contacts.length > 1 && (
        <select className="input mt-1 !py-1" value={contact?.id} onChange={(e) => setPicked(e.target.value)}>
          {info.contacts.map((c) => <option key={c.id} value={c.id}>{c.name || c.email} {c.title ? `(${c.title})` : ""}</option>)}
        </select>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button className="btn-primary !px-3 !py-1 text-xs" disabled={drafting || info.excluded || (!contact?.email && !manual)} onClick={draft}>
          {drafting ? "Writing…" : `Draft pitch for @${creator.handle}`}
        </button>
        {result && (
          <span className={result.ok ? "text-emerald-700" : "text-red-700"}>
            {result.msg} {result.link && <a className="underline" href={result.link} target="_blank" rel="noreferrer">open</a>}
          </span>
        )}
      </div>
    </div>
  );
}
