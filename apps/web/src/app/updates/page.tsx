import Link from "next/link";
import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { UpdateReview } from "@/components/UpdateReview";
import { UpdateSettings } from "@/components/UpdateSettings";

export const metadata = { title: "Creator updates | Sponsorprint" };

export default async function Updates() {
  const profile = await currentProfile();
  if (!profile) redirect("/login?next=/updates");
  const admin = supabaseAdmin();
  const [{ data: roster }, { data: updates }] = await Promise.all([
    admin.from("roster_creators").select("id,name,handle,creator_email,monthly_update,update_show_money,update_show_early").eq("user_id", profile.id).order("name"),
    admin.from("creator_updates").select("id,subject,body,status,month,roster_creator_id").eq("user_id", profile.id).order("month", { ascending: false }).limit(60),
  ]);
  const byId = new Map((roster || []).map((r) => [r.id, r]));
  const paid = ["pro", "agency", "team", "admin"].includes(profile.plan);
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6"><div className="label mb-1.5">Creator updates</div><h1 className="h2">Monthly updates to your creators</h1><p className="mt-1 text-sm text-muted">On the 1st, a draft is written for each creator you've switched on: what was pitched, who replied, what closed, and which brands started booking their lane. You review, edit and send from your own Gmail. Stages come from <Link href="/pipeline" className="text-accent hover:underline">Pipeline</Link>.</p></div>
      {!paid && <div className="card mb-6 border-warn/40 p-4 text-[13px]">Monthly updates are part of Pro. <Link href="/pricing" className="text-accent hover:underline">See plans →</Link></div>}
      <div className="card mb-8 divide-y divide-line">
        {(roster || []).map((r) => <UpdateSettings key={r.id} r={r} disabled={!paid} />)}
        {!roster?.length && <div className="p-6 text-center text-muted">Add creators to your roster first.</div>}
      </div>
      <div className="grid gap-4">
        {(updates || []).map((u) => { const r = byId.get(u.roster_creator_id); return <UpdateReview key={u.id} u={{ id: u.id, subject: u.subject || "", body: u.body || "", status: u.status, creator: r?.name || "creator", email: r?.creator_email || null, month: new Date(u.month + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) }} />; })}
        {!updates?.length && <div className="num text-center text-[11px] text-dim">No drafts yet. The first batch is written on the 1st for creators switched on above.</div>}
      </div>
    </div>
  );
}
