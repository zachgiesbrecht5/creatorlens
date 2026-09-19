import Link from "next/link";
import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { HoodView } from "@/components/HoodView";

// A neighborhood started from a print: the same three cards, and each card
// can start its own neighborhood, so you can keep walking the lane.
export default async function HoodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await currentProfile();
  if (!profile) redirect(`/login?next=/n/${id}`);
  const admin = supabaseAdmin();
  const { data: n } = await admin.from("neighborhoods").select("id,user_id,creator_id,roster_creator_id,status").eq("id", id).single();
  if (!n || (n.user_id !== profile.id && profile.plan !== "admin")) redirect("/start");
  let seed: { name: string; handle: string; platform: string; followers: number | null; avatar_url: string | null; href: string; creatorId: string | null } | null = null;
  if (n.creator_id) { const { data: c } = await admin.from("creators").select("id,display_name,handle,platform,followers,avatar_url").eq("id", n.creator_id).single(); if (c) seed = { name: c.display_name || c.handle, handle: c.handle, platform: c.platform, followers: c.followers, avatar_url: c.avatar_url, href: `/c/${c.platform}/${c.handle}`, creatorId: c.id }; }
  else if (n.roster_creator_id) { const { data: r } = await admin.from("roster_creators").select("name,handle,platform,followers,avatar_url").eq("id", n.roster_creator_id).single(); if (r) seed = { name: r.name, handle: r.handle || "", platform: r.platform, followers: r.followers, avatar_url: r.avatar_url, href: "/start", creatorId: null }; }
  return (
    <div className="st">
      <div className="mb-4 num text-[11px] text-dim"><Link href={seed?.href || "/start"} className="hover:text-accent">← back to {seed ? `${seed.name}'s print` : "Start"}</Link></div>
      <HoodView hoodId={n.id} seed={seed} />
    </div>
  );
}
