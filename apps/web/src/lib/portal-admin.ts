import { currentProfile, supabaseAdmin } from "@/lib/supabase";
/** Manager-side guard: the roster row must belong to the signed-in manager (or admin). */
export async function ownRoster(rosterCreatorId: string) {
  const profile = await currentProfile(); if (!profile) return null;
  const { data: r } = await supabaseAdmin().from("roster_creators").select("*").eq("id", rosterCreatorId).single();
  if (!r) return null;
  if (r.user_id !== profile.id && !(profile.org_id && r.org_id === profile.org_id) && profile.plan !== "admin") return null;
  return { profile, roster: r };
}
