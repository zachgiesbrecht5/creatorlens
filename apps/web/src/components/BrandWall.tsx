"use client";
import { useState } from "react";
import Link from "next/link";
import { ContactCard, type ContactInfo } from "./ContactCard";

export type WallCard = {
  creator_id: string; brand_id: string; brand: string; is_mass_sponsor: boolean; deals: number; platforms: string[];
  best_score: number; best_label: "High" | "Medium" | "Low"; first_seen: string | null; last_seen: string | null;
  evidence: string | null; content_url: string | null; content_title: string | null; repeat_partner: boolean; creators_booked: number;
};

type Creator = { id: string; handle: string; platform: string; displayName: string };

export function BrandWall({ cards, creator, signedIn }: { cards: WallCard[]; creator: Creator; signedIn: boolean }) {
  const [minLabel, setMinLabel] = useState<"High" | "Medium" | "Low">("Medium");
  const [hideMass, setHideMass] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, ContactInfo | "loading">>({});
  const rank = { High: 3, Medium: 2, Low: 1 };
  const shown = cards.filter((c) => rank[c.best_label] >= rank[minLabel] && !(hideMass && c.is_mass_sponsor));

  async function hover(brandId: string) {
    if (!signedIn || contacts[brandId]) return;
    setContacts((s) => ({ ...s, [brandId]: "loading" }));
    const r = await fetch(`/api/contacts/${brandId}`);
    const j = r.ok ? await r.json() : { contacts: [], history: [], excluded: false };
    setContacts((s) => ({ ...s, [brandId]: j }));
  }

  if (!cards.length) return <div className="card mt-6 p-8 text-center text-slate-600">No brand deals detected yet. Either the scan is still running or this creator has no disclosed partnerships in the window.</div>;

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-500">{shown.length} brands</span>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(["High", "Medium", "Low"] as const).map((l) => (
            <button key={l} onClick={() => setMinLabel(l)} className={`rounded-md px-2.5 py-1 ${minLabel === l ? "bg-slate-900 text-white" : "text-slate-600"}`}>{l}+</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={hideMass} onChange={(e) => setHideMass(e.target.checked)} /> hide mass sponsors</label>
        {!signedIn && <span className="ml-auto text-slate-500">Sign in to see contacts and draft pitches.</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => {
          const isOpen = open === c.brand_id;
          return (
            <div key={c.brand_id} className={`card relative p-4 transition ${isOpen ? "border-brand ring-2 ring-brand-soft" : "hover:border-slate-300"}`}
              onMouseEnter={() => hover(c.brand_id)} onClick={() => setOpen(isOpen ? null : c.brand_id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/brands/${c.brand_id}`} className="truncate font-semibold hover:text-brand" onClick={(e) => e.stopPropagation()}>{c.brand}</Link>
                    {c.repeat_partner && <span className="pill bg-emerald-50 text-emerald-700" title="2+ deals 30+ days apart">repeat</span>}
                    {c.is_mass_sponsor && <span className="pill bg-slate-100 text-slate-500" title="Sponsors everyone; low signal">mass</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {c.deals} {Number(c.deals) === 1 ? "deal" : "deals"} · {c.platforms.map((p) => (p === "youtube" ? "YT" : p === "instagram" ? "IG" : "TT")).join(" + ")}
                    {c.last_seen && <> · last {new Date(c.last_seen).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</>}
                    {Number(c.creators_booked) > 1 && <> · books {c.creators_booked} creators</>}
                  </div>
                </div>
                <Conf label={c.best_label} />
              </div>
              {c.evidence && (
                <p className="mt-2 line-clamp-2 text-xs text-slate-600" title={c.evidence}>“{c.evidence}”</p>
              )}
              {c.content_url && (
                <a href={c.content_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-1 inline-block text-xs text-brand hover:underline">
                  view post ↗
                </a>
              )}
              {signedIn && (
                <div className="mt-3 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
                  <ContactCard brandId={c.brand_id} brand={c.brand} creator={creator} info={contacts[c.brand_id]} expanded={isOpen} onLoad={() => hover(c.brand_id)} />
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
  const cls = label === "High" ? "bg-emerald-50 text-emerald-700" : label === "Medium" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-500";
  return <span className={`pill shrink-0 ${cls}`}>{label}</span>;
}
