import { currentAccess, supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { Start } from "@/components/Start";
import { Journey } from "@/components/Journey";
import { journeyState } from "@/lib/supabase";

export const metadata = { title: "Start | Sponsorprint" };

export default async function StartPage() {
  const { profile, insider } = await currentAccess();
  if (!profile) redirect("/login?next=/start");
  const admin = supabaseAdmin();
  const { data: roster } = await admin.from("roster_creators").select("id,name,handle,platform,followers,avatar_url,bio").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(30);
  if (!profile.onboarded_at) await admin.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", profile.id);
  const js = await journeyState(profile.id);
  return <><Journey s={js} /><Start initialRoster={(roster || []) as any} isHouse={insider} /></>;
}
