import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { Experiments } from "@/components/Experiments";
export default async function MyExperiments() {
  const { roster: r, preview } = await requireCreator();
  const { data } = await supabaseAdmin().from("experiments").select("*").eq("roster_creator_id", r.id).order("created_at", { ascending: false });
  return (
    <div className="mx-auto max-w-5xl">
      {preview && <div className="mb-4 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-[12.5px]"><span>Previewing as <b>{r.name}</b>.</span><a href="/api/portal/preview?clear=1" className="num text-[11px] text-accent hover:underline">end preview</a></div>}
      <div className="mb-5"><div className="label mb-1">Experiments</div><h1 className="h1">What you've tested</h1><p className="mt-1 text-[14px] text-muted">Ideas from your manager and your own. Mark what you tried and how it did; it feeds the monthly strategy conversation.</p></div>
      <Experiments rows={data || []} api="/api/me/experiments" />
    </div>
  );
}
