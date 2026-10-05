import { supabaseAdmin } from "@/lib/supabase";
/** Everyone in the same org as this profile (including the profile itself). Solo accounts get just themselves. */
export async function orgMemberIds(profile: { id: string; org_id?: string | null }): Promise<string[]> {
  if (!profile.org_id) return [profile.id];
  const { data } = await supabaseAdmin().from("profiles").select("id").eq("org_id", profile.org_id);
  const ids = (data || []).map((p) => p.id);
  return ids.includes(profile.id) ? ids : [profile.id, ...ids];
}
