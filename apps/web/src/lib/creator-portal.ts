import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

/** The roster row this signed-in creator belongs to, linking it on first sight. Null if not a creator or the portal is off. */
export async function creatorContext() {
  const profile = await currentProfile();
  if (!profile) return null;
  const admin = supabaseAdmin();
  const email = String(profile.email || "").toLowerCase();
  // The same creator can sit on several managers' rosters (Zach's, Victoria's, test accounts).
  // Pick the row that has the portal on; otherwise the one owned by an admin; otherwise the newest.
  const { data: rows } = email ? await admin.from("roster_creators").select("*").or(`creator_user_id.eq.${profile.id},creator_email.ilike.${email}`) : { data: [] as any[] };
  let r: any = null;
  if (rows?.length) {
    const { data: owners } = await admin.from("profiles").select("id,plan").in("id", [...new Set(rows.map((x: any) => x.user_id))]);
    const isAdmin = (uid: string) => owners?.find((o) => o.id === uid)?.plan === "admin";
    r = rows.find((x: any) => x.portal_enabled && isAdmin(x.user_id)) || rows.find((x: any) => x.portal_enabled) || rows.find((x: any) => isAdmin(x.user_id)) || rows.sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    if (r && r.creator_user_id !== profile.id) await admin.from("roster_creators").update({ creator_user_id: profile.id }).eq("id", r.id);
    if (r && profile.role !== "creator") await admin.from("profiles").update({ role: "creator" }).eq("id", profile.id);
  }
  if (!r) return null;
  return { profile, roster: r, enabled: !!r.portal_enabled };
}

/** Guard for /me pages: creators only, portal on; everyone else goes home. */
export async function requireCreator() {
  const ctx = await creatorContext();
  if (!ctx) redirect("/");
  if (!ctx.enabled) redirect("/me/off");
  return ctx;
}
