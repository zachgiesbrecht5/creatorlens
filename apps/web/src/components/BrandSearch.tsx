"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = { id: string; name: string; domain: string | null; category: string | null; creators: number; deals: number; mass: boolean };

// Brand typeahead. Enter with no pick falls through to the page's own filter
// (Brands page) or to the leaderboard search (home).
export function BrandSearch({ placeholder = "Search brands", autoFocus = false, size = "md", fallbackHref = "/brands?q=" }: { placeholder?: string; autoFocus?: boolean; size?: "md" | "lg"; fallbackHref?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [i, setI] = useState(-1);
  const timer = useRef<any>();
  const router = useRouter();
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => { const r = await fetch(`/api/brands/search?q=${encodeURIComponent(q)}`); if (r.ok) setHits(await r.json()); }, 120);
  }, [q]);
  const go = (h?: Hit) => { if (h) router.push(`/brands/${h.id}`); else if (q.trim()) router.push(fallbackHref + encodeURIComponent(q.trim())); };
  return (
    <div className="relative">
      <input value={q} autoFocus={autoFocus} onChange={(e) => { setQ(e.target.value); setI(-1); }} onKeyDown={(e) => { if (e.key === "ArrowDown") setI((x) => Math.min(x + 1, hits.length - 1)); if (e.key === "ArrowUp") setI((x) => Math.max(x - 1, -1)); if (e.key === "Enter") go(i >= 0 ? hits[i] : undefined); if (e.key === "Escape") setHits([]); }} placeholder={placeholder} className={size === "lg" ? "w-full rounded-lg border border-line bg-surface px-4 py-3 text-[16px] outline-none focus:border-fg" : "input !w-64"} />
      {hits.length > 0 && (
        <ul className="card absolute z-10 mt-2 w-full min-w-[22rem] overflow-hidden shadow-pop">
          {hits.map((h, k) => (
            <li key={h.id}>
              <button onMouseDown={() => go(h)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accentSoft/50 ${k === i ? "bg-accentSoft/50" : ""}`}>
                {h.domain ? <img src={`https://www.google.com/s2/favicons?domain=${h.domain}&sz=64`} alt="" className="h-7 w-7 rounded" /> : <span className="h-7 w-7 rounded bg-surface2" />}
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium">{h.name}</span><span className="num block truncate text-[10.5px] text-muted">{h.category || "uncategorized"}{h.mass ? " · mass sponsor" : ""}</span></span>
                <span className="num text-right text-[11px] text-muted"><b className="text-fg">{h.creators}</b> creators<br />{h.deals} deals</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
