import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin, supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function savePrompt(formData: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  await sb.from("profiles").update({
    pitch_prompt: String(formData.get("pitch_prompt") || "").slice(0, 4000) || null,
    signature: String(formData.get("signature") || "").slice(0, 80) || null,
    email_signature: String(formData.get("email_signature") || "").slice(0, 1200) || null,
  }).eq("id", user.id);
  redirect("/settings?saved=1");
}

async function addRoster(formData: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const name = String(formData.get("name") || "").trim().slice(0, 80);
  if (!name) return;
  const { data: prof } = await sb.from("profiles").select("org_id").eq("id", user.id).single();
  const followers = parseInt(String(formData.get("followers") || "").replace(/[^0-9]/g, ""), 10);
  await sb.from("roster_creators").insert({
    user_id: user.id, org_id: prof?.org_id || null, name,
    handle: String(formData.get("handle") || "").trim().replace(/^@/, "").slice(0, 60) || null,
    platform: String(formData.get("platform") || "multi"),
    followers: Number.isFinite(followers) ? followers : null,
    niche: String(formData.get("niche") || "").trim().slice(0, 120) || null,
    pitch_angle: String(formData.get("pitch_angle") || "").trim().slice(0, 600) || null,
    media_kit_url: String(formData.get("media_kit_url") || "").trim().slice(0, 300) || null,
  });
  redirect("/settings#roster");
}

async function removeRoster(formData: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  await sb.from("roster_creators").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  redirect("/settings#roster");
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string; ig?: string }> }) {
  const sp = await searchParams;
  const profile = await currentProfile();
  if (!profile) redirect("/login?next=/settings");
  const admin = supabaseAdmin();
  const [{ data: ig }, { data: gc }, { data: ledger }, { data: roster }] = await Promise.all([
    admin.from("ig_connections").select("ig_username,healthy,cooldown_until,created_at").eq("user_id", profile.id),
    admin.from("google_connections").select("email,updated_at").eq("user_id", profile.id).maybeSingle(),
    admin.from("credit_ledger").select("kind,delta,reason,created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(15),
    admin.from("roster_creators").select("*").eq("user_id", profile.id).order("name"),
  ]);
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/login?ref=${profile.referral_code}`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <form action={savePrompt} className="card p-6">
          <h2 className="h2 text-xl">Your pitch style</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">This is the skill the drafter follows. Write it the way you would brief a new teammate: tone, structure, what to lead with, what never to say. The deal evidence is added automatically.</p>
          <textarea name="pitch_prompt" rows={10} className="input-flat mt-5 font-mono text-xs leading-relaxed" defaultValue={profile.pitch_prompt || ""} placeholder={`Example:\nWarm and short, two paragraphs max. Open with the specific reason this creator fits (a past deal with them or a competitor). Second paragraph: one line on audience and format. Close with a single question. Never quote rates; ask for their budget range. No em dashes, no "I hope this finds you well".`} />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Sign-off phrase</label>
              <input name="signature" className="input-flat mt-1" defaultValue={profile.signature || ""} placeholder="rooting for you" />
            </div>
            <div>
              <label className="label">Email signature (appended to every draft, exactly as written)</label>
              <textarea name="email_signature" rows={5} className="input-flat mt-1 font-mono text-xs leading-relaxed" defaultValue={profile.email_signature || ""} placeholder={`rooting for you,\n${profile.full_name || "Your name"}\nCo-Founder, Rootfor Group\nrootforgroup.com · 431-000-0000`} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button className="btn-primary ml-auto">Save</button>
            {sp.saved && <span className="font-mono text-[11px] text-ok">Saved</span>}
          </div>
        </form>

        <div className="card p-6" id="roster">
          <h2 className="h2 text-xl">My creators</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">The creators you represent. Every pitch is written for one of these; the scanned creator on a brand wall is only the proof that the brand books this kind of talent.</p>
          {roster?.length ? (
            <div className="mt-4 divide-y divide-line">
              {roster.map((r) => (
                <div key={r.id} className="flex items-start gap-3 py-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{r.name} {r.handle && <span className="font-mono text-[11px] text-muted">@{r.handle}</span>} {r.platform && r.platform !== "multi" && <span className="pill ml-1">{r.platform}</span>}</div>
                    <div className="mt-0.5 text-xs text-muted">{[r.followers ? `${Intl.NumberFormat().format(r.followers)} followers` : null, r.niche].filter(Boolean).join(" · ")}</div>
                    {r.pitch_angle && <div className="mt-1 text-xs leading-relaxed text-dim">{r.pitch_angle}</div>}
                  </div>
                  <form action={removeRoster}><input type="hidden" name="id" value={r.id} /><button className="font-mono text-[11px] text-dim hover:text-bad">remove</button></form>
                </div>
              ))}
            </div>
          ) : <p className="mt-4 font-mono text-[11px] text-warn">No creators yet. Add one below to unlock pitch drafts.</p>}
          <form action={addRoster} className="mt-5 grid gap-3 border-t border-line pt-5 md:grid-cols-2">
            <input name="name" required className="input-flat" placeholder="Name (e.g. Andy Yen)" />
            <input name="handle" className="input-flat" placeholder="Primary handle (e.g. andyyyen)" />
            <select name="platform" className="input-flat" defaultValue="multi">
              <option value="multi">Multi-platform</option><option value="youtube">YouTube</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option>
            </select>
            <input name="followers" className="input-flat" placeholder="Followers (e.g. 250000)" inputMode="numeric" />
            <input name="niche" className="input-flat md:col-span-2" placeholder="Niche (e.g. lifestyle / design, NYC)" />
            <textarea name="pitch_angle" rows={2} className="input-flat md:col-span-2" placeholder="Pitch angle: the one or two lines a brand should hear first" />
            <input name="media_kit_url" className="input-flat md:col-span-2" placeholder="Media kit link (optional)" />
            <div className="md:col-span-2 flex justify-end"><button className="btn-ghost">Add creator</button></div>
          </form>
        </div>

        <div className="card p-6">
          <h2 className="h2 text-xl">Connections</h2>
          <div className="mt-4 divide-y divide-line">
            <Row title="Gmail drafts" ok={!!gc} detail={gc ? `Connected as ${gc.email}. Drafts only; nothing is ever sent.` : "Not connected. Sign out and sign in again, then approve the Gmail draft permission."} />
            <Row title="Instagram" ok={!!ig?.length}
              detail={ig?.length ? `Connected: ${ig.map((c) => "@" + c.ig_username).join(", ")}. ${ig.some((c) => c.cooldown_until && new Date(c.cooldown_until) > new Date()) ? "Cooling down after a rate limit." : "Healthy."}` : "Connect your Instagram Business or Creator account. It adds scanning capacity for everyone and unlocks Instagram scans for you."}
              action={<a href="/api/ig/connect" className="btn-ghost">{ig?.length ? "Add another" : "Connect Instagram"}</a>} />
            {sp.ig === "ok" && <p className="pt-3 font-mono text-[11px] text-ok">Instagram connected.</p>}
            {sp.ig && sp.ig !== "ok" && <p className="pt-3 font-mono text-[11px] text-bad">{decodeURIComponent(sp.ig)}</p>}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-6">
          <h2 className="h2 text-xl">Plan</h2>
          <p className="mt-1 font-mono text-[11px] uppercase text-muted">{profile.plan}</p>
          {profile.plan === "trial" && (
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-bg p-3"><div className="text-2xl font-semibold">{profile.scan_credits}</div><div className="label">scans left</div></div>
              <div className="rounded-xl bg-bg p-3"><div className="text-2xl font-semibold">{profile.draft_credits}</div><div className="label">drafts left</div></div>
            </div>
          )}
          <h3 className="mt-6 text-sm font-medium">Invite a teammate</h3>
          <p className="mt-1 text-xs text-muted">You both get 10 scans when they sign up.</p>
          <input readOnly className="input-flat mt-2 font-mono text-[11px]" value={inviteUrl} onFocus={undefined} />
        </div>
        <div className="card p-6">
          <h2 className="label">Recent activity</h2>
          <ul className="mt-3 space-y-1.5 font-mono text-[11px] text-muted">
            {(ledger || []).map((l, i) => (
              <li key={i} className="flex justify-between"><span>{l.reason} ({l.kind})</span><span className={l.delta > 0 ? "text-ok" : ""}>{l.delta > 0 ? "+" : ""}{l.delta}</span></li>
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
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-ok" : "bg-dim"}`} />
      <div className="flex-1"><div className="text-sm font-medium">{title}</div><div className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</div></div>
      {action}
    </div>
  );
}
