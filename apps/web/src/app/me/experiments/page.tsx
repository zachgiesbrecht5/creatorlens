import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { Experiments } from "@/components/Experiments";
export default async function MyExperiments() {
  const { roster: r } = await requireCreator();
  const { data } = await supabaseAdmin().from("experiments").select("*").eq("roster_creator_id", r.id).order("created_at", { ascending: false });
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5"><div className="label mb-1">Experiments</div><h1 className="h1">What you've tested</h1><p className="mt-1 text-[14px] text-muted">Ideas from your manager and your own. Mark what you tried and how it did; it feeds the monthly strategy conversation.</p></div>
      <Experiments rows={data || []} api="/api/me/experiments" />
    </div>
  );
}
