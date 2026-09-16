// Sponsorprint mark: a paw print whose pad is a receipt with a torn edge.
// "Print" twice over: the creator (paw) and the sponsor print (receipt). The
// blue line is the deal line, the same blue as "Draft pitch" on every print.
export function PawMark({ size = 24, tile = "#0b0d12", ink = "#fbfbfa", className }: { size?: number; tile?: string | null; ink?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden className={className}>
      {tile && <rect width="120" height="120" rx="28" fill={tile} />}
      <g fill={ink}>
        <ellipse cx="38" cy="40" rx="9" ry="12" transform="rotate(-18 38 40)" />
        <ellipse cx="82" cy="40" rx="9" ry="12" transform="rotate(18 82 40)" />
        <ellipse cx="54" cy="26" rx="8" ry="11" transform="rotate(-6 54 26)" />
        <ellipse cx="66" cy="26" rx="8" ry="11" transform="rotate(6 66 26)" />
        <path d="M40 60 h40 v34 l-4 4 l-4 -4 l-4 4 l-4 -4 l-4 4 l-4 -4 l-4 4 l-4 -4 l-4 4 l-4 -4 z" />
      </g>
      <g stroke={tile || "#0b0d12"} strokeWidth="2.6" strokeLinecap="round" fill="none"><path d="M48 70 h24" /><path d="M48 78 h16" /></g>
      <path d="M48 86 h24" stroke="#2f5bff" strokeWidth="2.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ size = 24, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <PawMark size={size} className="shrink-0" />
      {wordmark && <span className="text-[15px] font-semibold tracking-[-0.02em]">sponsor<span className="font-medium">print</span></span>}
    </span>
  );
}
