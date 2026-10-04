import { readHook } from "@/lib/hook-read";

const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const SRC: Record<string, string> = { said: "bg-[#2f5bff] text-white", "on-video": "bg-[#6b38c7] text-white", "on-cover": "bg-[#6b38c7] text-white", caption: "bg-[#5b6472] text-white" };

/** One top post: the number, the opening a viewer actually gets (tagged by source), then the other channels with plain empty states. */
export function HookCard({ t, rank, perf, platform }: { t: any; rank: number; perf: any; platform: string }) {
  const h = readHook(t, platform);
  const leadKey = h.source === "said" ? "voice" : h.source === "caption" ? "caption" : "screen";
  const noTalk = h.audio === "music" || h.audio === "no-voice" || h.audio === "silent";
  return (
    <a href={t.url} target="_blank" rel="noreferrer" className={`flex items-start gap-3 rounded-lg border border-line border-l-[3px] p-3 hover:border-fg ${t.sponsored ? "border-l-[#0e6b45]" : ""}`}>
      <div className="num w-[72px] flex-none">
        <div className="text-[10.5px] text-muted">#{rank}</div>
        <div className="text-[17px] font-semibold leading-tight text-fg">{fmtN(t.metric)}</div>
        <div className="text-[10.5px] text-muted">{perf.metric_label}</div>
        <div className="text-[11px] font-semibold text-ok">{perf.median >= 1000 ? (t.metric / perf.median).toFixed(1) + "x median" : `#${rank} of ${perf.items}`}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-1.5 py-[1px] text-[10px] font-bold tracking-wide ${SRC[h.source]}`}>{h.sourceLabel}</span>
          {h.audio !== "voice" && h.audioLabel && <span className={`rounded border px-1.5 py-[0px] text-[10px] font-bold tracking-wide ${h.audio === "unread" ? "border-line text-muted" : "border-[#b86b05] text-[#8c5200]"}`}>{h.audioLabel}</span>}
          <span className="num ml-auto text-[10.5px] text-muted">{new Date(t.published_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })} · {t.kind}{t.sponsored ? " · sponsored" : ""}</span>
        </div>
        <div className="line-clamp-3 text-[14px] font-semibold leading-snug text-fg">"{h.lead}"</div>
        <dl className="mt-1.5 grid grid-cols-[72px_1fr] gap-x-2 gap-y-0.5 text-[12px]">
          {h.channels.filter((c) => c.key !== leadKey).map((c) => (
            <div key={c.key} className="contents">
              <dt className="num text-[10px] uppercase tracking-wide text-muted">{c.label}</dt>
              <dd className={`truncate ${c.text ? "text-fg" : c.key === "voice" && noTalk ? "italic text-[#8c5200]" : "italic text-muted"}`}>{c.text ? `"${c.text}"` : c.empty}</dd>
            </div>
          ))}
        </dl>
      </div>
    </a>
  );
}
