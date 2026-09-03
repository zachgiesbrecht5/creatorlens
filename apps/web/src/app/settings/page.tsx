import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin, supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function savePrompt(formData: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  await sb.from("profiles").update({ pitch_prompt: String(formData.get("pitch_prompt") || "").slice(0, 4000) || null, signature: String(formData.get("signature") || "").slice(0, 80) || null }).eq("id", user.id);
  redirect("/settings?saved=1");
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string; ig?: string }> }) {
  const sp = await searchParams;
  const profile = await currentProfile();
  if (!profile) redirect("/login?next=/settings");
  const admin = supabaseAdmin();
  const [{ data: ig }, { data: gc }, { data: ledger }] = await Promise.all([
    admin.from("ig_connections").select("ig_username,healthy,cooldown_until,created_at").eq("user_id", profile.id),
    admin.from("google_connections").select("email,updated_at").eq("user_id", profile.id).maybeSingle(),
    admin.from("credit_ledger").select("kind,delta,reason,created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(15),
  ]);
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/login?ref=${profile.referral_code}`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <form action={savePrompt} className="card p-6">
          <h2 className="text-lg font-semibold">Your pitch style</h2>
          <p className="mt-1 text-sm text-slate-600">This is the skill the drafter follows. Write it the way you would brief a new teammate: tone, structure, what to lead with, what never to say. The deal evidence is added automatically.</p>
          <textarea name="pitch_prompt" rows={10} className="input mt-4 font-mono text-xs" defaultValue={profile.pitch_prompt || ""} placeholder={`Example:\nWarm and short, two paragraphs max. Open with the specific reason this creator fits (a past deal with them or a competitor). Second paragraph: one line on audience and format. Close with a single question. Never quote rates; ask for their budget range. No em dashes, no "I hope this finds you well".`} />
          <div className="mt-3 flex items-center gap-3">
            <label className="text-sm text-slate-600">Sign-off</label>
            <input name="signature" className="input !w-56" defaultValue={profile.signature || ""} placeholder="rooting for you" />
            <button className="btn-primary ml-auto">Save</button>
            {sp.saved && <span className="text-sm text-emerald-700">Saved</span>}
          </div>
        </form>

        <div className="card p-6">
          <h2 className="text-lg font-semibold">Connections</h2>
          <div className="mt-4 divide-y divide-slate-100">
            <Row title="Gmail drafts" ok={!!gc} detail={gc ? `Connected as ${gc.email}. Drafts only; nothing is ever sent.` : "Not connected. Sign out and sign in again, then approve the Gmail draft permission."} />
            <Row title="Instagram" ok={!!ig?.length}
              detail={ig?.length ? `Connected: ${ig.map((c) => "@" + c.ig_username).join(", ")}. ${ig.some((c) => c.cooldown_until && new Date(c.cooldown_until) > new Date()) ? "Cooling down after a rate limit." : "Healthy."}` : "Connect your Instagram Business or Creator account. It adds scanning capacity for everyone and unlocks Instagram scans for you."}
              action={<a href="/api/ig/connect" className="btn-ghost">{ig?.length ? "Add another" : "Connect Instagram"}</a>} />
            {sp.ig === "ok" && <p className="pt-3 text-sm text-emerald-700">Instagram connected.</p>}
            {sp.ig && sp.ig !== "ok" && <p className="pt-3 text-sm text-red-700">{decodeURIComponent(sp.ig)}</p>}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold">Plan</h2>
          <p className="mt-1 text-sm capitalize text-slate-600">{profile.plan}</p>
          {profile.plan === "trial" && (
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-2xl font-semibold">{profile.scan_credits}</div><div className="text-xs text-slate-500">scans left</div></div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-2xl font-semibold">{profile.draft_credits}</div><div className="text-xs text-slate-500">drafts left</div></div>
            </div>
          )}
          <h3 className="mt-5 text-sm font-medium">Invite a teammate</h3>
          <p className="mt-1 text-xs text-slate-600">You both get 10 scans when they sign up.</p>
          <input readOnly className="input mt-2 text-xs" value={inviteUrl} onFocus={undefined} />
        </div>
        <div className="card p-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Recent activity</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {(ledger || []).map((l, i) => (
              <li key={i} className="flex justify-between"><span>{l.reason} ({l.kind})</span><span className={l.delta > 0 ? "text-emerald-700" : ""}>{l.delta > 0 ? "+" : ""}{l.delta}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Row({ title, ok, detail, action }: { title: string; ok: boolean; detail: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-slate-300"}`} />
      <div className="flex-1"><div className="text-sm font-medium">{title}</div><div className="text-xs text-slate-600">{detail}</div></div>
      {action}
    </div>
  );
}
