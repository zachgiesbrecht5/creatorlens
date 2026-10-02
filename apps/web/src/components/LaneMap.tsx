"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PrintTimeline, type TL } from "@/components/PrintTimeline";

// Under the neighbor cards: the lane drawn as a map. Every brand paying the
// neighbors, by month; brands the seed creator hasn't worked with come first.
export function LaneMap({ hoodId, refreshKey }: { hoodId: string | null; refreshKey: number }) {
  const [data, setData] = useState<{ items: (TL & { has?: boolean })[]; seedName?: string; missing?: number } | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!hoodId) return;
    fetch(`/api/neighborhood/map?id=${hoodId}`).then((r) => (r.ok ? r.json() : null)).then((j) => j && setData(j)).catch(() => {});
  }, [hoodId, refreshKey]);
  if (!data?.items?.length) return null;
  return (
    <section className="mt-8">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div><div className="label">The lane, mapped</div><div className="text-[13px] text-muted">Every brand paying these neighbors. <b className="text-fg">{data.missing}</b> haven't paid {data.seedName} yet; they're listed first. Hover a dot for who they pay, click a brand for contacts.</div></div>
      </div>
      <div className="card px-5 pb-3 pt-2"><PrintTimeline items={data.items} onPick={(id) => router.push(`/brands/${id}`)} /></div>
    </section>
  );
}
