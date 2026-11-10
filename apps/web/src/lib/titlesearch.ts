import { currentAccess, currentUser } from "@/lib/supabase";

/** Title Search costs ~450 YouTube units + a model call, so running one is for admins, the house,
 *  paid plans and roster creators (their own title research). Viewing a finished search is anyone
 *  signed in who can run one, so results can be shared inside the team. */
export async function titleSearchAccess() {
  const user = await currentUser();
  const { admin: seesAll, insider, profile } = await currentAccess();
  const paid = !!profile && ["pro", "agency", "team", "admin"].includes(String(profile.plan));
  const isCreator = profile?.role === "creator";
  const run = !!user && (seesAll || insider || paid || isCreator);
  // per-person daily cap (the worker also caps the whole day's units)
  const perDay = seesAll ? 20 : insider ? 12 : isCreator ? 4 : 8;
  return { user, profile, run, view: run, perDay, seesAll };
}

export const SEARCH_FRESH_DAYS = 7;
export const promptKey = (p: string) => p.toLowerCase().replace(/[^\p{L}\p{N}$ ]+/gu, " ").replace(/\s+/g, " ").trim();
export const WINDOWS = [30, 90, 365] as const;
export const FORMATS = ["any", "video", "short"] as const;
