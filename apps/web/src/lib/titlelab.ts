import { canSeeCreator, currentAccess, currentUser, supabaseAdmin } from "@/lib/supabase";

/** Who may open a creator's Title Lab: same rule as the print (admins, anyone who unlocked the creator,
 *  the creator themself). Running or re-running it costs quota + a model call, so that is admins, the
 *  house, paid plans, and the creator for their own channel. */
export async function titleLabAccess(creatorId: string) {
  const admin = supabaseAdmin();
  const user = await currentUser();
  const { data: creator } = await admin.from("creators").select("id,platform,handle,external_id,display_name,category,followers,avatar_url,last_scanned_at").eq("id", creatorId).maybeSingle();
  if (!creator) return { creator: null, user, view: false, run: false, insider: false, isOwn: false };
  const { admin: seesAll, insider, profile } = await currentAccess();
  const view = creator.platform === "youtube" && (await canSeeCreator(user?.id || null, seesAll, creator));
  let isOwn = false;
  if (user && profile?.role === "creator") {
    const { data: mine } = await admin.from("roster_creators").select("handle,platform").eq("creator_user_id", user.id);
    isOwn = (mine || []).some((r) => r.platform === "youtube" && String(r.handle || "").replace(/^@/, "").toLowerCase() === creator.handle.toLowerCase());
  }
  const paid = !!profile && ["pro", "agency", "team", "admin"].includes(String(profile.plan));
  const run = view && !!user && (seesAll || insider || paid || isOwn);
  return { creator, user, view, run, insider: insider || seesAll, isOwn };
}

export const LAB_FRESH_DAYS = 7;
