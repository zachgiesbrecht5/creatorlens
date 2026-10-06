"use client";
import { useState } from "react";
import Link from "next/link";

const VIA: Record<string, string> = { search: "disclosure search", linked: "linked from their YouTube", credit: "tagged by the brand", hashtag: "used the partner hashtag" };
const size = (n: number | null) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/** The "who else do they book" rows, both platforms. `shared` = read-only view for creators:
 *  links go to the public post, and unconfirmed rows are hidden once printing is finished. */
export function ScanList({ found, shared = false }: { found: any[]; shared?: boolean }) {
  const yt = found.filter((f) => f.platform !== "instagram").length;
  const ig = found.filter((f) => f.platform === "instagram").length;
  const [tab, setTab] = useState<"all" | "youtube" | "instagram">("all");
  let rows = found.filter((f) => tab === "all" || (tab === "instagram" ? f.platform === "instagram" : f.platform !== "instagram"));
  if (shared) rows = rows.filter((f) => f.confirmed_deals > 0);
  rows = [...rows].sort((a, b) => Number(b.confirmed_deals > 0) - Number(a.confirmed_deals > 0) || Number(b.new_to_index) - Number(a.new_to_index) || (b.followers || 0) - (a.followers || 0));
  return (
    <div>
      <div className="mt-3 flex gap-1.5">
        {([["all", `All ${yt + ig}`], ["youtube", `YouTube ${yt}`], ["instagram", `Instagram ${ig}`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`pill !text-[11px] ${tab === k ? "!border-accent !text-accent" : ""}`}>{label}</button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="num mt-3 text-[11.5px] text-muted">{tab === "instagram" ? "No Instagram creators confirmed for this brand yet." : "Nothing confirmed here yet."}</p>
      ) : (
        <div className="bs-list">
          <div className="bs-head"><span>creator</span><span>the post that matched</span><span>size</span><span>{shared ? "deal" : "print"}</span></div>
          {rows.map((f: any) => {
            const isIg = f.platform === "instagram";
            return (
              <div key={`${f.platform}:${f.external_id}`} className="bs-row">
                <span className="flex min-w-0 items-center gap-2">
                  {f.avatar_url ? <img src={f.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="inline-block h-7 w-7 rounded-full bg-surface2" />}
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5"><span className="block truncate text-[13.5px] font-semibold tracking-tight">{f.display_name}</span><span className={`num shrink-0 rounded px-1 text-[9px] font-medium text-white ${isIg ? "bg-[#c13584]" : "bg-[#e5302a]"}`}>{isIg ? "IG" : "YT"}</span></span>
                    <span className="num block truncate text-[10px] text-muted">{isIg ? `@${f.handle}` : ""}{isIg && f.category ? " · " : ""}{f.category || ""}{!shared && (f.via || []).length ? `${isIg || f.category ? " · " : ""}${(f.via as string[]).map((v) => VIA[v] || v).join(", ")}` : ""}{!shared && !f.category && !isIg && !(f.via || []).length ? (f.new_to_index ? "new to the index" : "already printed") : ""}</span>
                  </span>
                </span>
                {f.post_url ? <a href={f.post_url} target="_blank" rel="noreferrer" className="num truncate text-[11px] text-muted hover:text-accent" title={f.video_title}>{f.video_title || "open post"} ↗</a> : <span className="num truncate text-[11px] text-muted">{f.video_title}</span>}
                <span className="num text-[11px]">{size(f.followers)}</span>
                <span className="num text-[11px]">
                  {shared ? <span className="text-ok">{f.confirmed_deals} disclosed deal{f.confirmed_deals === 1 ? "" : "s"}</span>
                    : f.print_status === "done" ? <Link href={`/c/${f.platform}/${f.handle}`} className="text-accent hover:underline">{f.confirmed_deals > 0 ? `${f.confirmed_deals} deal${f.confirmed_deals === 1 ? "" : "s"} confirmed →` : "open print →"}</Link>
                    : f.print_status === "failed" ? <span className="text-dim">failed</span>
                    : f.print_status === "not printed" ? <span className="text-dim">over today's cap</span>
                    : <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />printing</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
