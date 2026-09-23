import Link from "next/link";

// Under the print header: who's next to this creator, and the brands paying
// the lane that haven't paid this creator yet. The second list is the pitch
// list: proof the brand books this kind of talent, and a gap to fill.
type Miss = { brand_id: string; brand: string; website: string | null; creators: number; sample: string[] };
type Nb = { id: string; handle: string; platform: string; name: string; avatar: string | null };
const dom = (w: string | null) => (w ? String(w).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : null);

export function Missing({ missing, neighbors, lane, creatorId, platform }: { missing: Miss[]; neighbors: Nb[]; lane: string; creatorId: string; platform: string }) {
  return (
    <div className="ms">
      {neighbors.length > 0 && (
        <div className="ms-block">
          <div className="ms-head"><span className="label">Neighbors</span><Link href={`/n/${neighbors[0].id}`} className="num text-[10.5px] text-accent hover:underline">walk the lane →</Link></div>
          <div className="ms-people">
            {neighbors.map((n) => (
              <Link key={n.handle} href={`/c/${n.platform}/${n.handle}`} className="ms-person" title={n.name}>
                {n.avatar ? <img src={n.avatar} alt="" /> : <span className="ms-blank" />}
                <span className="truncate">{n.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {missing.length > 0 && (
        <div className="ms-block">
          <div className="ms-head"><span className="label">Missing opportunities</span><span className="num text-[10.5px] text-dim">brands paying {lane} creators, not this one yet</span></div>
          <div className="ms-brands">
            {missing.map((m) => (
              <Link key={m.brand_id} href={`/brands/${m.brand_id}`} className="ms-brand" title={`Books: ${m.sample.join(", ")}`}>
                {dom(m.website) ? <img src={`https://www.google.com/s2/favicons?domain=${dom(m.website)}&sz=32`} alt="" /> : <span className="ms-blank ms-blank-sq" />}
                <span className="ms-brand-name">{m.brand}</span>
                <span className="num text-[10px] text-muted">{m.creators} in lane</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
