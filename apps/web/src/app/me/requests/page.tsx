import { requireCreator } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
import { Requests } from "@/components/Requests";
export default async function MyRequests() {
  const { roster: r } = await requireCreator();
  const { data } = await supabaseAdmin().from("requests").select("*").eq("roster_creator_id", r.id).order("created_at", { ascending: false });
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5"><div className="label mb-1">Requests</div><h1 className="h1">Ask us</h1><p className="mt-1 text-[14px] text-muted">An editor, a brand intro, a rate check, anything. Every request keeps its status until it's done.</p></div>
      <Requests rows={data || []} api="/api/me/requests" asCreator />
    </div>
  );
}
