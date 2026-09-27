"use client";
import { useState } from "react";
import Link from "next/link";
import { ContactCard, type ContactInfo } from "@/components/ContactCard";
import type { RosterCreator } from "@/components/BrandWall";

export type LaneBrand = { brand_id: string; brand: string; category: string | null; website: string | null; deals: number; last: string | null; contacts: number; creators: { id: string; handle: string; platform: string; name: string; avatar: string | null; followers: number | null }[] };
const dom = (w: string | null) => (w ? String(w).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : null);
const mon = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "");
const fmtK = (n: number | null) => (!n ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

// The lane's brands as rows. Click a row: the proof creators, the contact card
// (with this roster creator preselected) and Pitch, all inline.
export function LaneWall({ brands, roster }: { brands: LaneBrand[]; roster: RosterCreator }) {
  const [open, setOpen] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, ContactInfo | "loading">>({});
  const [q, setQ] = useState("");
  async function load(brandId: string) {
    setContacts((c) => (c[brandId] ? c : { ...c, [brandId]: "loading" }));
    const r = await fetch(`/api/contacts/${brandId}`);
    const j: ContactInfo = r.ok ? await r.json() : ({ contacts: [], history: [], excluded: false } as any);
    setContacts((c) => ({ ...c, [brandId]: j }));
    if (j.research && (j.research.status === "queued" || j.research.status === "running")) setTimeout(() => load(brandId), 8000);
  }
  const shown = brands.filter((b) => !q || b.brand.toLowerCase().includes(q.toLowerCase()) || (b.category || "").toLowerCase().includes(q.toLowerCase()));
  if (!brands.length) return <div className="card p-6 text-[13px] text-muted">Nothing yet: the lane is thin in the index. Run a neighborhood or two and this fills in.</div>;
  return (
    <div className="lw">
      <div className="lw-tools"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter brands or categories" className="input-flat !w-72 !py-1.5 text-[13px]" /><span className="num text-[11px] text-dim">{shown.length} brands</span></div>
      <div className="lw-head"><span>brand</span><span>who they pay in the lane</span><span>deals</span><span>last</span><span>contact</span></div>
      {shown.map((b, idx) => {
        const isOpen = open === b.brand_id;
        const proof = b.creators[0];
        return (
          <div key={b.brand_id} className={`lw-row ${isOpen ? "lw-open" : ""}`} {...(idx === 0 ? { "data-tour": "row" } : {})}>
            <button className="lw-line" onClick={() => { setOpen(isOpen ? null : b.brand_id); if (!isOpen) load(b.brand_id); }}>
              <span className="lw-brand">{dom(b.website) ? <img src={`https://www.google.com/s2/favicons?domain=${dom(b.website)}&sz=64`} alt="" /> : <span className="lw-fav-blank" />}<span className="min-w-0"><span className="block truncate text-[15px] font-semibold tracking-tight">{b.brand}</span><span className="num block text-[10.5px] text-muted">{b.category || ""}</span></span></span>
              <span className="lw-people">{b.creators.map((c) => <span key={c.id} className="lw-person" title={`${c.name} · ${fmtK(c.followers)}`}>{c.avatar ? <img src={c.avatar} alt="" /> : <span className="lw-fav-blank" style={{ borderRadius: "50%" }} />}</span>)}<span className="num ml-2 text-[11px] text-muted">{b.creators.length} creator{b.creators.length === 1 ? "" : "s"}</span></span>
              <span className="num text-[12px]">{b.deals}</span>
              <span className="num text-[11.5px] text-muted">{mon(b.last)}</span>
              <span className="num text-[11px]">{b.contacts > 0 ? <span className="text-ok">{b.contacts} on file</span> : <span className="text-dim">find →</span>}</span>
            </button>
            {isOpen && (
              <div className="lw-detail">
                <div className="lw-proof">
                  <div className="label mb-1.5">Proof: who {b.brand} pays in this lane</div>
                  <div className="flex flex-wrap gap-2">{b.creators.map((c) => <Link key={c.id} href={`/c/${c.platform}/${c.handle}`} className="lw-proof-chip">{c.avatar ? <img src={c.avatar} alt="" /> : <span className="lw-fav-blank" style={{ borderRadius: "50%" }} />}<span>{c.name}</span><span className="num text-[10px] text-muted">{fmtK(c.followers)}</span></Link>)}</div>
                </div>
                {proof && <ContactCard brandId={b.brand_id} brand={b.brand} creator={{ id: proof.id, handle: proof.handle, platform: proof.platform, displayName: proof.name }} roster={[roster]} info={contacts[b.brand_id]} expanded onLoad={() => load(b.brand_id)} preferRoster={roster.id} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
