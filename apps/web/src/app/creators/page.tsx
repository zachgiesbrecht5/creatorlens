import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin, supabaseServer } from "@/lib/supabase";

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
  redirect("/creators");
}

async function removeRoster(formData: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  await sb.from("roster_creators").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  redirect("/creators");
}

export default async function Creators() {
  const profile = await currentProfile();
  if (!profile) redirect("/login?next=/creators");
  const admin = supabaseAdmin();
  const { data: roster } = await admin.from("roster_creators").select("*").eq("user_id", profile.id).order("name");
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <div className="label mb-1.5">Roster</div>
        <h1 className="h2">My creators</h1>
        <p className="mt-1 text-sm text-muted">The creators you represent. Every pitch Sponsorprint writes is for one of them; the creator you scan on a brand wall is only the proof that the brand books this kind of talent.</p>
      </div>
      <div className="card p-6" id="roster">
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

    </div>
  );
}
