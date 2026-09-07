// Sponsorprint wordmark. The mark is three offset arcs: a fingerprint read as
// a signal, which is what the product does (a creator's sponsorship print).
export function Logo({ size = 18, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
        <rect width="24" height="24" rx="6" fill="#0b0d12" />
        <path d="M6.5 15.5c0-3.6 2.4-6.5 5.5-6.5s5.5 2.9 5.5 6.5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M9.2 16.5c0-2 1.3-3.6 2.8-3.6s2.8 1.6 2.8 3.6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M12 17.5v-1.2" stroke="#2f5bff" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
      {wordmark && <span className="text-[15px] font-semibold tracking-[-0.02em]">sponsorprint</span>}
    </span>
  );
}
