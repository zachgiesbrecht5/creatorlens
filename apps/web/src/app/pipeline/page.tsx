import Link from "next/link";
import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { StageControl } from "@/components/StageControl";

export const metadata = { title: "Pipeline | Sponsorprint" };

// Every pitch you've drafted, with a tappable stage. Five seconds a day here
// makes the monthly creator updates accurate.
export default async function Pipeline() {
  const profile = await currentProfile();
  if (!profile) redirect("/login?next=/pipeline");
  const admin = supabaseAdmin();
  const q = admin.from("outreach_log").select("id,brand_id,creator_handle,contact_email,subject,stage,deal_value,note,created_at,updated_at,brands(name,domain)").order("updated_at", { ascending: false }).limit(300);
  const { data: rows } = profile.plan === "admin" ? await q : profile.org_id ? await q.eq("org_id", profile.org_id) : await q.eq("user_id", profile.id);
  const groups: Record<string, any[]> = {};
  for (const r of rows || []) (groups[r.stage || "pitched"] ||= []).push(r);
  const order = ["negotiating", "replied", "pitched", "closed", "dead"];
  const closedValue = (groups.closed || []).reduce((s, r) => s + Number(r.deal_value || 0), 0);
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div><div className="label mb-1.5">Pipeline</div><h1 className="h2">Every pitch, where it stands</h1><p className="mt-1 text-sm text-muted">Tap the stage as things move. Closed and negotiating rows take a dollar figure. This feeds the monthly updates you send your creators.</p></div>
        <div className="text-right"><div className="num text-[22px] font-semibold">{(rows || []).length}</div><div className="num text-[10.5px] text-muted">pitches · {closedValue ? `$${closedValue.toLocaleString()} closed` : "nothing closed yet"}</div></div>
      </div>
      {order.filter((k) => groups[k]?.length).map((k) => (
        <section key={k} className="mb-6">
          <div className="label mb-2">{k} · {groups[k].length}</div>
          <div className="card divide-y divide-line">
            {groups[k].map((r: any) => (
              <div key={r.id} className="grid items-center gap-3 px-4 py-3 md:grid-cols-[1.2fr_1fr_auto]">
                <div className="min-w-0"><Link href={`/brands/${r.brand_id}`} className="text-[14px] font-medium hover:text-accent">{r.brands?.name || "Brand"}</Link><div className="num truncate text-[10.5px] text-muted">for @{r.creator_handle} · {r.contact_email} · {new Date(r.created_at).toLocaleDateString()}</div></div>
                <div className="num truncate text-[11.5px] text-muted">{r.subject}</div>
                <StageControl id={r.id} stage={r.stage || "pitched"} value={r.deal_value} />
              </div>
            ))}
          </div>
        </section>
      ))}
      {!rows?.length && <div className="card p-8 text-center text-muted">No pitches yet. Draft one from any print and it lands here.</div>}
    </div>
  );
}
