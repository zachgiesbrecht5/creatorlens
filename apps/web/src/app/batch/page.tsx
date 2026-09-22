import { currentProfile } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { BatchRunner } from "@/components/BatchRunner";

export const metadata = { title: "Batch prints | Sponsorprint" };

export default async function Batch() {
  const profile = await currentProfile();
  if (!profile) redirect("/login?next=/batch");
  const paid = ["pro", "agency", "team", "admin"].includes(profile.plan);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <div className="label mb-1.5">Batch</div>
        <h1 className="h2">Print a list of creators</h1>
        <p className="mt-1 text-sm text-muted">Paste handles or profile links, one per line. Up to 100 at a time. Already-printed creators come back instantly and cost nothing.{!paid && " Free plans can pull 25 new prints a day."}</p>
      </div>
      <BatchRunner />
    </div>
  );
}
