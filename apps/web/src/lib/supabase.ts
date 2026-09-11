import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Server component / route handler client bound to the user's cookies. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all: CookieToSet[]) => { try { all.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {} },
    },
  });
}

/** Service-role client. Server only. Bypasses RLS: use for the queue, tokens, and pool writes. */
export function supabaseAdmin() {
  return createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export async function currentUser() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user;
}

export async function currentProfile() {
  const user = await currentUser();
  if (!user) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
  return data;
}

/**
 * House scope. Insiders (members of the house org, or plan=admin) see the whole
 * shared index; everyone else sees only creators they unlocked by scanning.
 */
export async function currentAccess() {
  const profile = await currentProfile();
  if (!profile) return { profile: null, insider: false };
  if (profile.plan === "admin") return { profile, insider: true };
  if (!profile.org_id) return { profile, insider: false };
  const { data: org } = await supabaseAdmin().from("orgs").select("is_house").eq("id", profile.org_id).maybeSingle();
  return { profile, insider: !!org?.is_house };
}

/** Has this user unlocked this creator (scanned it themselves)? Insiders always yes. */
export async function canSeeCreator(userId: string | null, insider: boolean, creator: { platform: string; handle: string; external_id?: string | null }) {
  if (insider) return true;
  if (!userId) return false;
  const admin = supabaseAdmin();
  const handles = [creator.handle.toLowerCase(), (creator.external_id || "").toLowerCase()].filter(Boolean);
  const { data } = await admin.from("creator_access").select("handle").eq("user_id", userId).eq("platform", creator.platform).in("handle", handles).limit(1);
  return !!data?.length;
}

export async function grantCreatorAccess(userId: string, platform: string, handle: string) {
  await supabaseAdmin().from("creator_access").upsert({ user_id: userId, platform, handle: handle.toLowerCase() }, { onConflict: "user_id,platform,handle", ignoreDuplicates: true });
}
