"use client";
import { useState } from "react";
import Link from "next/link";
import { ContactCard, type ContactInfo } from "./ContactCard";

export type WallCard = {
  creator_id: string; brand_id: string; brand: string; is_mass_sponsor: boolean; deals: number; platforms: string[];
  best_score: number; best_label: "High" | "Medium" | "Low"; first_seen: string | null; last_seen: string | null;
  evidence: string | null; content_url: string | null; content_title: string | null; repeat_partner: boolean; creators_booked: number;
  website: string | null; site_status: "unknown" | "ok" | "dead"; is_junk: boolean;
};

export type RosterCreator = { id: string; name: string; handle: string | null; platform: string | null; followers: number | null };

type Creator = { id: string; handle: string; platform: string; displayName: string };

export function BrandWall({ cards, creator, signedIn, roster }: { cards: WallCard[]; creator: Creator; signedIn: boolean; roster: RosterCreator[] }) {
  const [minLabel, setMinLabel] = useState<"High" | "Medium" | "Low">("Medium");
  const [hideMass, setHideMass] = useState(false);
  const [showDead, setShowDead] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, ContactInfo | "loading">>({});
  const [gone, setGone] = useState<Set<string>>(new Set());
  const rank = { High: 3, Medium: 2, Low: 1 };
  const dead = cards.filter((c) => c.site_status === "dead").length;
  const shown = cards.filter((c) => !gone.has(c.brand_id) && rank[c.best_label] >= rank[minLabel] && !(hideMass && c.is_mass_sponsor) && (showDead || c.site_status !== "dead"));

  async function reject(brandId: string, scope: "pair" | "brand") {
    setGone((g) => new Set(g).add(brandId));
    await fetch("/api/reject", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId, creatorId: creator.id, scope }) });
  }

  async function hover(brandId: string) {
    if (!signedIn || contacts[brandId]) return;
    setContacts((s) => ({ ...s, [brandId]: "loading" }));
    const r = await fetch(`/api/contacts/${brandId}`);
    const j = r.ok ? await r.json() : { contacts: [], history: [], excluded: false };
    setContacts((s) => ({ ...s, [brandId]: j }));
  }

  if (!cards.length) return <div className="card mt-8 p-10 text-center text-sm text-muted">No brand deals detected yet. Either the scan is still running or this creator has no disclosed partnerships in the window.</div>;

  return (
    <div className="mt-10">
      <div className="mb-4 mt-8 flex flex-wrap items-center gap-4">
        <span className="label"><span className="num text-fg">{shown.length}</span> brands</span>
        <div className="flex rounded-md bg-surface2 p-0.5 font-mono text-[11px]">
          {(["High", "Medium", "Low"] as const).map((l) => (
            <button key={l} onClick={() => setMinLabel(l)} className={`rounded px-3 py-1 transition ${minLabel === l ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}>{l}+</button>
          ))}
        </div>
        <label className="flex items-center gap-2 font-mono text-[11px] text-muted"><input type="checkbox" className="accent-accent" checked={hideMass} onChange={(e) => setHideMass(e.target.checked)} /> hide mass sponsors</label>
        {dead > 0 && (
          <label className="flex items-center gap-2 font-mono text-[11px] text-muted" title="Names we could not match to a live website; usually parsing noise">
            <input type="checkbox" className="accent-accent" checked={showDead} onChange={(e) => setShowDead(e.target.checked)} /> show {dead} unverified
          </label>
        )}
        {!signedIn && <span className="ml-auto font-mono text-[11px] text-dim">Sign in to see contacts and draft pitches.</span>}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => {
          const isOpen = open === c.brand_id;
          return (
            <div key={c.brand_id} className={`card relative cursor-pointer p-5 transition ${isOpen ? "border-accent shadow-pop" : "hover:border-line2 hover:shadow-pop"}`}
              onMouseEnter={() => hover(c.brand_id)} onClick={() => setOpen(isOpen ? null : c.brand_id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {c.website ? (
                    <a href={c.website} target="_blank" rel="noreferrer" className="block truncate text-base font-semibold tracking-tight hover:text-accent" onClick={(e) => e.stopPropagation()} title={c.website}>{c.brand} <span className="font-mono text-[10px] text-dim">↗</span></a>
                  ) : (
                    <span className="block truncate text-base font-semibold tracking-tight" title={c.site_status === "dead" ? "No website found for this name" : "Website not checked yet"}>{c.brand}</span>
                  )}
                  <div className="num mt-1 text-[10px] text-muted">
                    {c.deals} {Number(c.deals) === 1 ? "deal" : "deals"} · {c.platforms.map((p) => (p === "youtube" ? "YT" : p === "instagram" ? "IG" : "TT")).join(" + ")}
                    {c.last_seen && <> · {new Date(c.last_seen).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</>}
                    {Number(c.creators_booked) > 1 && <> · <Link href={`/brands/${c.brand_id}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>books {c.creators_booked} ↗</Link></>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Conf label={c.best_label} />
                  {c.repeat_partner && <span className="pill-accent" title="2+ deals 30+ days apart">repeat</span>}
                  {c.is_mass_sponsor && <span className="pill" title="Sponsors everyone; low signal">mass</span>}
                  {c.site_status === "dead" && <span className="pill-warn" title="No live website found">unverified</span>}
                </div>
              </div>
              {c.evidence && <p className="mt-3 line-clamp-2 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-muted" title={c.evidence}>{c.evidence}</p>}
              {c.content_url && (
                <a href={c.content_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="num mt-2 inline-block text-[10px] text-dim hover:text-accent">view post ↗</a>
              )}
              {signedIn && (
                <div className="mt-4 border-t border-line pt-4" onClick={(e) => e.stopPropagation()}>
                  <ContactCard brandId={c.brand_id} brand={c.brand} creator={creator} roster={roster} info={contacts[c.brand_id]} expanded={isOpen} onLoad={() => hover(c.brand_id)} />
                  {isOpen && (
                    <div className="mt-3 flex gap-3 font-mono text-[10px] text-dim">
                      <button className="hover:text-bad" title="Hide this brand for this creator (agency link, own merch, collab credit)" onClick={() => reject(c.brand_id, "pair")}>not a sponsor of @{creator.handle}</button>
                      <button className="hover:text-bad" title="Never a sponsor for anyone (music library, agency, vendor). Team accounts only." onClick={() => reject(c.brand_id, "brand")}>never a sponsor</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Conf({ label }: { label: "High" | "Medium" | "Low" }) {
  return <span className={label === "High" ? "pill-ok" : label === "Medium" ? "pill-warn" : "pill"}>{label}</span>;
}
