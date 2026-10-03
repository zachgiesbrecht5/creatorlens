"use client";
import { useState } from "react";
import Link from "next/link";
import { ContactCard, type ContactInfo } from "@/components/ContactCard";
import type { RosterCreator } from "@/components/BrandWall";
import type { Launch } from "@/lib/launches";

const dom = (w: string | null) => (w ? String(w).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : null);
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const KIND: Record<string, string> = { launch: "Launch", restock: "Restock", campaign: "Campaign", giveaway: "Giveaway", collab: "Collab" };
const STATUS: Record<Launch["status"], { label: string; cls: string }> = { open: { label: "pitch window open", cls: "ll-open" }, soon: { label: "window opens", cls: "ll-soon" }, repush: { label: "seasonal re-push month", cls: "ll-repush" }, past: { label: "window passed", cls: "ll-past" } };

// Launches in a lane, with the pitch window and one-click pitch (roster creator preselected, launch fed to the draft).
export function LaunchList({ launches, roster, locked = false }: { launches: Launch[]; roster?: RosterCreator | null; locked?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, ContactInfo | "loading">>({});
  async function load(brandId: string) {
    setContacts((c) => (c[brandId] ? c : { ...c, [brandId]: "loading" }));
    const r = await fetch(`/api/contacts/${brandId}`); const j: ContactInfo = r.ok ? await r.json() : ({ contacts: [], history: [], excluded: false } as any);
    setContacts((c) => ({ ...c, [brandId]: j }));
  }
  if (!launches.length) return null;
  return (
    <div className="ll">
      {launches.map((l) => {
        const st = STATUS[l.status]; const isOpen = open === l.id;
        const hook = l.spoken || l.on_video;
        return (
          <div key={l.id} className={`ll-row ${isOpen ? "ll-row-open" : ""}`}>
            <div className="ll-line">
              <div className="ll-brand">{dom(l.website) ? <img src={`https://www.google.com/s2/favicons?domain=${dom(l.website)}&sz=64`} alt="" /> : <span className="ll-blank" />}<div className="min-w-0"><div className="truncate text-[14px] font-semibold tracking-tight"><Link href={`/brands/${l.brand_id}`} className="hover:text-accent">{l.brand}</Link>{l.product ? <span className="font-normal text-muted"> · {l.product}</span> : null}</div><div className="num text-[10.5px] text-muted">{KIND[l.kind] || l.kind} · posted {d(l.posted_at)} · pays {l.lane_creators} in this lane{l.contacts ? ` · ${l.contacts} contact${l.contacts === 1 ? "" : "s"} on file` : ""}</div></div></div>
              <div className="ll-window"><span className={`ll-pill ${st.cls}`}>{st.label}{l.status === "soon" || l.status === "open" ? ` · ${d(l.window_start)} to ${d(l.window_end)}` : l.status === "repush" && l.repush_month ? ` · ${new Date(l.repush_month).toLocaleDateString("en-US", { month: "long" })}` : ""}</span></div>
              <div className="ll-act">{locked ? <Link href="/pricing?need=launches" className="btn-ghost !py-1 !text-[12px]">unlock →</Link> : roster ? <button className="btn-dark !py-1 !text-[12px]" onClick={() => { setOpen(isOpen ? null : l.id); if (!isOpen) load(l.brand_id); }}>{isOpen ? "close" : "pitch this"}</button> : <Link href={`/brands/${l.brand_id}`} className="btn-ghost !py-1 !text-[12px]">brand page →</Link>}</div>
            </div>
            {!locked && (hook || l.summary) && <div className="ll-detail-line">{hook ? <span className="text-fg">"{hook}"</span> : null}{hook && l.summary ? " · " : ""}<span className="text-muted">{l.summary}</span> <a href={l.url} target="_blank" rel="noreferrer" className="num text-[10.5px] text-accent hover:underline">open post ↗</a></div>}
            {isOpen && !locked && roster && (
              <div className="ll-pitch"><ContactCard brandId={l.brand_id} brand={l.brand} creator={{ id: "", handle: "", platform: roster.platform === "youtube" ? "youtube" : "instagram", displayName: "" }} roster={[roster]} info={contacts[l.brand_id]} expanded onLoad={() => load(l.brand_id)} preferRoster={roster.id} launch={{ product: l.product, kind: l.kind, posted: l.posted_at, window: l.status === "open" || l.status === "soon" ? `${d(l.window_start)} to ${d(l.window_end)}` : null, hook }} /></div>
            )}
          </div>
        );
      })}
    </div>
  );
}
