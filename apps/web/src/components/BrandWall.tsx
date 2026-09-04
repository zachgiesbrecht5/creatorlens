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
  const rank = { High: 3, Medium: 2, Low: 1 };
  const dead = cards.filter((c) => c.site_status === "dead").length;
  const shown = cards.filter((c) => rank[c.best_label] >= rank[minLabel] && !(hideMass && c.is_mass_sponsor) && (showDead || c.site_status !== "dead"));

  async function hover(brandId: string) {
    if (!signedIn || contacts[brandId]) return;
    setContacts((s) => ({ ...s, [brandId]: "loading" }));
    const r = await fetch(`/api/contacts/${brandId}`);
    const j = r.ok ? await r.json() : { contacts: [], history: [], excluded: false };
    setContacts((s) => ({ ...s, [brandId]: j }));
  }

  if (!cards.length) return <div className="card mt-8 p-10 text-center text-muted">No brand deals detected yet. Either the scan is still running or this creator has no disclosed partnerships in the window.</div>;

  return (
    <div className="mt-10">
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <span className="label">{shown.length} brands</span>
        <div className="flex rounded-full border border-line p-0.5 font-mono text-[11px]">
          {(["High", "Medium", "Low"] as const).map((l) => (
            <button key={l} onClick={() => setMinLabel(l)} className={`rounded-full px-3 py-1 transition ${minLabel === l ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}>{l}+</button>
          ))}
        </div>
        <label className="flex items-center gap-2 font-mono text-[11px] text-muted"><input type="checkbox" className="accent-white" checked={hideMass} onChange={(e) => setHideMass(e.target.checked)} /> hide mass sponsors</label>
        {dead > 0 && (
          <label className="flex items-center gap-2 font-mono text-[11px] text-muted" title="Names we could not match to a live website; usually parsing noise">
            <input type="checkbox" className="accent-white" checked={showDead} onChange={(e) => setShowDead(e.target.checked)} /> show {dead} unverified
          </label>
        )}
        {!signedIn && <span className="ml-auto font-mono text-[11px] text-dim">Sign in to see contacts and draft pitches.</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => {
          const isOpen = open === c.brand_id;
          return (
            <div key={c.brand_id} className={`card relative p-5 transition ${isOpen ? "border-fg" : "hover:border-dim"}`}
              onMouseEnter={() => hover(c.brand_id)} onClick={() => setOpen(isOpen ? null : c.brand_id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {c.website ? (
                    <a href={c.website} target="_blank" rel="noreferrer" className="block truncate text-lg font-semibold hover:underline" onClick={(e) => e.stopPropagation()} title={c.website}>{c.brand} <span className="font-mono text-[10px] text-dim">↗</span></a>
                  ) : (
                    <span className="block truncate text-lg font-semibold" title={c.site_status === "dead" ? "No website found for this name" : "Website not checked yet"}>{c.brand}</span>
                  )}
                  <div className="mt-1 font-mono text-[10px] text-muted">
                    {c.deals} {Number(c.deals) === 1 ? "deal" : "deals"} · {c.platforms.map((p) => (p === "youtube" ? "YT" : p === "instagram" ? "IG" : "TT")).join(" + ")}
                    {c.last_seen && <> · {new Date(c.last_seen).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</>}
                    {Number(c.creators_booked) > 1 && <> · <Link href={`/brands/${c.brand_id}`} className="hover:text-fg" onClick={(e) => e.stopPropagation()}>books {c.creators_booked} ↗</Link></>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Conf label={c.best_label} />
                  {c.repeat_partner && <span className="pill-ok" title="2+ deals 30+ days apart">repeat</span>}
                  {c.is_mass_sponsor && <span className="pill" title="Sponsors everyone; low signal">mass</span>}
                  {c.site_status === "dead" && <span className="pill-warn" title="No live website found">unverified</span>}
                </div>
              </div>
              {c.evidence && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted" title={c.evidence}>“{c.evidence}”</p>}
              {c.content_url && (
                <a href={c.content_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-2 inline-block font-mono text-[10px] text-dim hover:text-fg">view post ↗</a>
              )}
              {signedIn && (
                <div className="mt-4 border-t border-line pt-4" onClick={(e) => e.stopPropagation()}>
                  <ContactCard brandId={c.brand_id} brand={c.brand} creator={creator} roster={roster} info={contacts[c.brand_id]} expanded={isOpen} onLoad={() => hover(c.brand_id)} />
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
