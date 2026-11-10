import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin, currentAccess, unlockedCreatorIds } from "@/lib/supabase";
import type { Deal } from "@/components/BookingMap";
import { track } from "@/lib/track";
import { enrichScan } from "@/lib/brandscan";
import { brandStats } from "@/lib/brand-intel";
import { BrandView } from "@/components/BrandView";

export const dynamic = "force-dynamic";

// A brand, read as a decision: how much they're booking and when, which creators they come back to,
// who else is behind the work, and everyone they've booked. House-only (contacts and the reverse view).
export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, insider, admin: seesAll } = await currentAccess();
  if (!insider) redirect("/brands");
  const scope = seesAll ? null : await unlockedCreatorIds(profile!.id);   // team members: only creators they scanned
  const inScope = (cid: string) => !scope || scope.includes(cid);
  const admin = supabaseAdmin();
  const { data: brand } = await admin.from("brands").select("*").eq("id", id).maybeSingle();
  if (!brand) return <NotFound />;
  if (profile) track(profile.id, "brand_view", { brand_id: brand.id, brand: brand.name });

  const NONE = ["00000000-0000-0000-0000-000000000000"];
  let rowsQ = admin.from("brand_wall_mv").select("creator_id,deals,first_seen,last_seen,repeat_partner,evidence,content_url,best_label,creators(handle,display_name,platform,followers,avatar_url,category)").eq("brand_id", id).order("last_seen", { ascending: false });
  if (scope) rowsQ = rowsQ.in("creator_id", scope.length ? scope : NONE);
  let dealsQ = admin.from("partnerships").select("published_at,platform,confidence_label,content_url,creator_id,creators(id,handle,display_name,followers,category,avatar_url)").eq("brand_id", id).neq("status", "rejected").not("published_at", "is", null).order("published_at", { ascending: true }).limit(500);
  if (scope) dealsQ = dealsQ.in("creator_id", scope.length ? scope : NONE);

  const [stats, { data: rows }, { data: dealRows }, { data: rebookRaw }, { data: behind }, { data: parent }, { data: research }, { data: rawScan }, { data: share }, { data: hiring }, { data: launches }] = await Promise.all([
    brandStats(admin, id),
    rowsQ,
    dealsQ,
    admin.rpc("brand_rebookers", { p_brand: id }),
    admin.rpc("brand_behind", { p_brand: id }),
    admin.from("brand_parents").select("parent").eq("match_key", brand.key).maybeSingle(),
    admin.from("contact_research").select("status,summary,parent_company,agency,agency_url,finished_at").eq("brand_id", id).eq("status", "done").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("brand_scans").select("id,status,found,ig_pulse,error,brand_id").eq("brand_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("brand_shares").select("token,views").eq("brand_id", id).is("revoked_at", null).limit(1).maybeSingle(),
    admin.from("hiring_signals").select("id,title,seniority,url,posted_at,found_at,closed_at,summary").eq("brand_id", id).order("found_at", { ascending: false }).limit(3),
    admin.from("launch_signals").select("id,kind,product,summary,posted_at,url,spoken,on_video,window_start,window_end,repush_month").eq("brand_id", id).order("posted_at", { ascending: false }).limit(6),
  ]);
  const lastScan = rawScan ? await enrichScan(admin, rawScan as any) : null;

  // rebookers, with the creator attached (and scoped like everything else)
  const rebook = ((rebookRaw || []) as { creator_id: string; bookings: number; first_at: string; last_at: string; avg_gap_days: number | null; next_due: string | null }[]).filter((r) => inScope(r.creator_id));
  const { data: rebookCreators } = rebook.length ? await admin.from("creators").select("id,handle,display_name,platform,followers,avatar_url,category").in("id", rebook.map((r) => r.creator_id)) : { data: [] };
  const creatorById = new Map((rebookCreators || []).map((c: any) => [c.id, c]));

  const repeatIds = new Set((rows || []).filter((r: any) => r.repeat_partner).map((r: any) => r.creator_id));
  const deals: Deal[] = (dealRows || []).filter((d: any) => d.creators).map((d: any) => ({ published_at: d.published_at, platform: d.platform, confidence_label: d.confidence_label, content_url: d.content_url, repeat: repeatIds.has(d.creator_id), creator: d.creators }));

  // who's behind it
  const retail = (behind || []).filter((b: any) => b.kind === "retail program" && !b.name.toLowerCase().includes(brand.name.toLowerCase()));
  const cobooked = (behind || []).filter((b: any) => b.kind === "co-booked");
  const parentName = research?.parent_company || parent?.parent || null;
  const showParent = parentName && !parentName.toLowerCase().startsWith(brand.name.toLowerCase());

  return <BrandView brand={brand} stats={stats} rows={rows || []} rebook={rebook.map((r) => ({ ...r, creator: creatorById.get(r.creator_id) })).filter((r) => r.creator)} retail={retail} cobooked={cobooked}
    parentName={parentName} showParent={!!showParent} research={research || null} launches={launches || []} hiring={hiring || []} deals={deals}
    scoped={!!scope} share={share || null} lastScan={lastScan} signedIn={!!profile} />;
}

function NotFound() {
  return <div className="card p-8 text-center"><h1 className="h2">Brand not found</h1><p className="mt-2 text-sm text-muted">It may have been merged into another brand or marked as not a sponsor.</p><Link href="/brands" className="btn-primary mt-4">Back to brands</Link></div>;
}
