"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { PrinterMachine } from "@/components/PrinterMachine";
import { ContactCard, type ContactInfo } from "./ContactCard";

export type WallCard = {
  creator_id: string; brand_id: string; brand: string; is_mass_sponsor: boolean; deals: number; platforms: string[];
  best_score: number; best_label: "High" | "Medium" | "Low"; first_seen: string | null; last_seen: string | null;
  evidence: string | null; content_url: string | null; content_title: string | null; repeat_partner: boolean; creators_booked: number;
  website: string | null; site_status: "unknown" | "ok" | "dead"; is_junk: boolean;
  category: string | null; is_self_brand: boolean;
};

export type RosterCreator = { id: string; name: string; handle: string | null; platform: string | null; followers: number | null };

type Creator = { id: string; handle: string; platform: string; displayName: string };

export function BrandWall({ cards, creator, signedIn, roster, header }: { cards: WallCard[]; creator: Creator; signedIn: boolean; roster: RosterCreator[]; header?: React.ReactNode }) {
  const [minLabel, setMinLabel] = useState<"High" | "Medium" | "Low">("Medium");
  const [hideMass, setHideMass] = useState(false);
  const [showDead, setShowDead] = useState(false);
  const [showSelf, setShowSelf] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<"recent" | "deals" | "confidence">("recent");
  const [contacts, setContacts] = useState<Record<string, ContactInfo | "loading">>({});
  const [gone, setGone] = useState<Set<string>>(new Set());
  const rank = { High: 3, Medium: 2, Low: 1 };
  const dead = cards.filter((c) => c.site_status === "dead").length;
  const self = cards.filter((c) => c.is_self_brand).length;
  const shown = cards.filter((c) => !gone.has(c.brand_id) && rank[c.best_label] >= rank[minLabel] && !(hideMass && c.is_mass_sponsor) && (showDead || c.site_status !== "dead") && (showSelf || !c.is_self_brand));

  async function reject(brandId: string, scope: "pair" | "brand") {
    setGone((g) => new Set(g).add(brandId));
    await fetch("/api/reject", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId, creatorId: creator.id, scope }) });
  }

  // re-poll a card while the research agent is working on it
  const pollers = useRef<Record<string, any>>({});
  function schedule(brandId: string) {
    if (pollers.current[brandId]) return;
    pollers.current[brandId] = setTimeout(async () => { delete pollers.current[brandId]; await refetch(brandId); }, 8000);
  }
  async function refetch(brandId: string) {
    const r = await fetch(`/api/contacts/${brandId}`); if (!r.ok) return;
    const j: ContactInfo = await r.json();
    setContacts((c) => ({ ...c, [brandId]: j }));
    if (j.research && (j.research.status === "queued" || j.research.status === "running")) schedule(brandId);
  }
  async function hover(brandId: string) {
    if (!signedIn || contacts[brandId]) return;
    setContacts((s) => ({ ...s, [brandId]: "loading" }));
    const r = await fetch(`/api/contacts/${brandId}`);
    const j: ContactInfo = r.ok ? await r.json() : { contacts: [], history: [], excluded: false };
    setContacts((s) => ({ ...s, [brandId]: j }));
    if (j.research && (j.research.status === "queued" || j.research.status === "running")) schedule(brandId);
  }

  const lcdIdle = `${cards.length} BRANDS ✓ TEAR`;
  if (!cards.length) return (
    <div className="mt-8">
      <div className="pw-machine"><PrinterMachine lcd="NO DEALS FOUND" /></div>
      <div className="pw">
        {header}
        <div className="pw-empty">No disclosed partnerships in the window. Either nothing was tagged, or the scan is still filling in.</div>
        <div className="rc-tear" />
      </div>
    </div>
  );

  const t = (d: string | null) => (d ? new Date(d).getTime() : 0);
  const sorted = [...shown].sort((a, b) =>
    sort === "recent" ? t(b.last_seen) - t(a.last_seen) || Number(b.deals) - Number(a.deals)
    : sort === "deals" ? Number(b.deals) - Number(a.deals) || t(b.last_seen) - t(a.last_seen)
    : b.best_score - a.best_score || t(b.last_seen) - t(a.last_seen));
  const when = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "");

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted">
        <span><span className="num font-medium text-fg">{sorted.length}</span> brands</span>
        <span className="flex items-center gap-1">
          <span className="text-dim">sort</span>
          {(["recent", "deals", "confidence"] as const).map((k) => (
            <button key={k} onClick={() => setSort(k)} className={`rounded px-2 py-0.5 transition ${sort === k ? "bg-fg text-white" : "hover:text-fg"}`}>{k}</button>
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-dim">confidence</span>
          {(["High", "Medium", "Low"] as const).map((l) => (
            <button key={l} onClick={() => setMinLabel(l)} className={`rounded px-2 py-0.5 transition ${minLabel === l ? "bg-fg text-white" : "hover:text-fg"}`}>{l}+</button>
          ))}
        </span>
        <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-fg" checked={hideMass} onChange={(e) => setHideMass(e.target.checked)} /> hide mass sponsors</label>
        {dead > 0 && <label className="flex items-center gap-1.5" title="Names we could not match to a live website; usually parsing noise"><input type="checkbox" className="accent-fg" checked={showDead} onChange={(e) => setShowDead(e.target.checked)} /> show {dead} unverified</label>}
        {self > 0 && <label className="flex items-center gap-1.5" title="Brands this creator owns. Not sponsors."><input type="checkbox" className="accent-fg" checked={showSelf} onChange={(e) => setShowSelf(e.target.checked)} /> show {self} creator-owned</label>}
        {!signedIn && <span className="ml-auto text-dim">Sign in to see contacts and draft pitches.</span>}
        {signedIn && roster.length === 0 && <span className="ml-auto">Add the creators you represent in <Link href="/settings#roster" className="text-accent hover:underline">Settings</Link> to draft pitches.</span>}
      </div>

      {/* The print: one continuous sheet out of the machine, newest deal at the top. */}
      <div className="pw-machine"><PrinterMachine lcd={lcdIdle} /></div>
      <div className="pw">
        {header}
        <div className="pw-head">
          <span className="pw-brandcol">brand</span>
          <span className="pw-evcol">evidence</span>
          <span className="pw-lastcol">last</span>
          <span className="pw-dealscol">deals</span>
          <span className="pw-confcol">conf.</span>
        </div>
        {sorted.map((c, i) => {
          const isOpen = open === c.brand_id;
          return (
            <div key={c.brand_id} className={`pw-row ${isOpen ? "pw-open" : ""}`} style={{ animationDelay: `${Math.min(i, 14) * 45}ms` }}
              onMouseEnter={() => hover(c.brand_id)} onClick={() => setOpen(isOpen ? null : c.brand_id)}>
              <div className="pw-line">
                <div className="pw-brandcol min-w-0">
                  <div className="flex items-center gap-2">
                    {c.website ? (
                      <a href={c.website} target="_blank" rel="noreferrer" className="truncate font-sans text-[15px] font-semibold tracking-tight hover:text-accent" onClick={(e) => e.stopPropagation()} title={c.website}>{c.brand}</a>
                    ) : (
                      <span className="truncate font-sans text-[15px] font-semibold tracking-tight" title={c.site_status === "dead" ? "No website found for this name" : "Website not checked yet"}>{c.brand}</span>
                    )}
                    {c.repeat_partner && <em className="pw-tag pw-tag-repeat" title="2+ deals 30+ days apart">repeat</em>}
                    {c.is_mass_sponsor && <em className="pw-tag" title="Sponsors everyone; low signal">mass</em>}
                    {c.site_status === "dead" && <em className="pw-tag" title="No live website found">unverified</em>}
                    {c.is_self_brand && <em className="pw-tag" title="Owned by this creator; not a sponsor">own brand</em>}
                  </div>
                  <div className="num mt-0.5 truncate text-[10.5px] text-dim">
                    {c.category && <Link href={`/brands?cat=${encodeURIComponent(c.category)}`} className="hover:text-accent" onClick={(e) => e.stopPropagation()}>{c.category}</Link>}
                    {c.category && " · "}{c.platforms.map((pl) => (pl === "youtube" ? "YT" : pl === "instagram" ? "IG" : "TT")).join(" + ")}
                    {Number(c.creators_booked) > 1 && <> · <Link href={`/brands/${c.brand_id}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>books {c.creators_booked}</Link></>}
                  </div>
                </div>
                <div className="pw-evcol min-w-0">
                  {c.evidence && <div className="truncate text-[12.5px] text-muted" title={c.evidence}>{c.evidence}</div>}
                  {c.content_url && <a href={c.content_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="num text-[10.5px] text-dim hover:text-accent">view post ↗</a>}
                </div>
                <div className="pw-lastcol num text-[12px] text-muted">{when(c.last_seen)}</div>
                <div className="pw-dealscol num text-right text-[13px]">{c.deals}</div>
                <div className="pw-confcol"><Conf label={c.best_label} /></div>
              </div>
              {signedIn && isOpen && (
                <div className="pw-drawer" onClick={(e) => e.stopPropagation()}>
                  <ContactCard brandId={c.brand_id} brand={c.brand} creator={creator} roster={roster} info={contacts[c.brand_id]} expanded onLoad={() => hover(c.brand_id)} />
                  <div className="mt-3 flex gap-3 font-mono text-[10px] text-dim">
                    <button className="hover:text-bad" title="Hide this brand for this creator (agency link, own merch, collab credit)" onClick={() => reject(c.brand_id, "pair")}>not a sponsor of @{creator.handle}</button>
                    <button className="hover:text-bad" title="Never a sponsor for anyone (music library, agency, vendor). Team accounts only." onClick={() => reject(c.brand_id, "brand")}>never a sponsor</button>
                  </div>
                </div>
              )}
              {signedIn && !isOpen && contacts[c.brand_id] && contacts[c.brand_id] !== "loading" && (contacts[c.brand_id] as ContactInfo).contacts[0]?.email && (
                <div className="pw-peek num">{(contacts[c.brand_id] as ContactInfo).contacts[0].email} · click to pitch</div>
              )}
            </div>
          );
        })}
        <div className="pw-foot">
          <span>{sorted.length} brands · {sorted.reduce((s, c) => s + Number(c.deals), 0)} deals · {sorted.filter((c) => c.repeat_partner).length} repeat</span>
          <span>public posts only</span>
        </div>
        <div className="rc-tear" />
      </div>
    </div>
  );
}

function Conf({ label }: { label: "High" | "Medium" | "Low" }) {
  return <span className={label === "High" ? "pill-ok" : label === "Medium" ? "pill-warn" : "pill"}>{label}</span>;
}
