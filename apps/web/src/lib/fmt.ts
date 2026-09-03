export function fmt(n: number | null | undefined) {
  const v = Number(n || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + "k";
  return String(v);
}
