import type { TrackerStatus } from "@/lib/tracker";
// A small chip: "pitched 12d ago · Karli · for Andy" / "do not contact" / "not contacted"
export function TrackerChip({ s }: { s?: TrackerStatus | null }) {
  if (!s) return null;
  const cls = s.state === "excluded" ? "tc-x" : s.state === "recent" ? "tc-recent" : s.state === "old" ? "tc-old" : "tc-clean";
  return <span className={`tc ${cls}`} title={s.detail || s.label}>{s.state === "clean" ? "not contacted" : s.state === "excluded" ? "do not contact" : s.label}{s.detail && s.state !== "excluded" ? <em> · {s.detail}</em> : null}</span>;
}
