import Link from "next/link";

// Three steps that check themselves off. Shown on the home page after sign-in
// until all three are done; each step links to where you do it.
export function FirstRun({ printed, roster, drafted }: { printed: boolean; roster: boolean; drafted: boolean }) {
  const steps = [
    { done: printed, title: "Pull a creator's print", body: "Type any YouTube or Instagram handle above. Twenty seconds.", href: null as string | null },
    { done: roster, title: "Add the creators you represent", body: "Every pitch is written for one of them. Name, handle, a line on their angle.", href: "/creators" },
    { done: drafted, title: "Draft your first pitch", body: "Open a print, click a brand, pick your creator, hit Pitch. It opens in your Gmail.", href: printed ? null : null },
  ];
  const n = steps.filter((s) => s.done).length;
  return (
    <section className="mt-8 card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="text-sm font-semibold tracking-tight">Getting started</div>
        <div className="num text-[11px] text-muted">{n} of 3</div>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={i} className={`flex gap-3 rounded-lg border p-4 ${s.done ? "border-ok/30 bg-okSoft/40" : "border-line"}`}>
            <span className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-semibold ${s.done ? "bg-ok text-white" : "bg-surface2 text-muted"}`}>{s.done ? "✓" : i + 1}</span>
            <div className="min-w-0">
              <div className={`text-[14px] font-medium ${s.done ? "line-through text-muted" : ""}`}>{s.href && !s.done ? <Link href={s.href} className="hover:text-accent">{s.title} →</Link> : s.title}</div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-muted">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
