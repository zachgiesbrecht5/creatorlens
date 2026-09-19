import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin, currentAccess, unlockedCreatorIds } from "@/lib/supabase";
import { fmt } from "@/lib/fmt";
import { Verticals } from "@/components/Verticals";
import { BookingMap, type Deal } from "@/components/BookingMap";

export const dynamic = "force-dynamic";

// Reverse view: every creator this brand has booked. This is the casting
// intel for "who does Brand X work with" and for competitor pitches.
import { BrandScan } from "@/components/BrandScan";
import { track } from "@/lib/track";

async function hiringFor(brandId: string) {
  const { data } = await supabaseAdmin().from("hiring_signals").select("id,title,seniority,url,posted_at,found_at,closed_at,summary").eq("brand_id", brandId).order("found_at", { ascending: false }).limit(3);
  return data || [];
}

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, insider, admin: seesAll } = await currentAccess();
  if (!insider) redirect("/brands");   // reverse view (every creator a brand booked, contacts) is house-only
  const scope = seesAll ? null : await unlockedCreatorIds(profile!.id);   // team members: only creators they scanned
  const admin = supabaseAdmin();
  const { data: brand } = await admin.from("brands").select("*").eq("id", id).single();
  if (!brand) return <p>Brand not found.</p>;
  const hiring = await hiringFor(brand.id);
  const { data: lastScan } = await supabaseAdmin().from("brand_scans").select("id,status,found,ig_pulse,error").eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (profile) track(profile.id, "brand_view", { brand_id: brand.id, brand: brand.name });
  let rowsQ = admin.from("brand_wall").select("*, creators(handle,display_name,platform,followers,avatar_url,category)").eq("brand_id", id).order("deals", { ascending: false });
  if (scope) rowsQ = rowsQ.in("creator_id", scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]);
  const { data: rows } = await rowsQ;
  // every deal, for the timeline
  let dealsQ = admin.from("partnerships").select("published_at,platform,confidence_label,content_url,creator_id,creators(id,handle,display_name,followers,category,avatar_url)").eq("brand_id", id).neq("status", "rejected").not("published_at", "is", null).order("published_at", { ascending: true }).limit(500);
  if (scope) dealsQ = dealsQ.in("creator_id", scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]);
  const { data: dealRows } = await dealsQ;
  const repeatIds = new Set((rows || []).filter((r: any) => r.repeat_partner).map((r: any) => r.creator_id));
  const deals: Deal[] = (dealRows || []).filter((d: any) => d.creators).map((d: any) => ({ published_at: d.published_at, platform: d.platform, confidence_label: d.confidence_label, content_url: d.content_url, repeat: repeatIds.has(d.creator_id), creator: d.creators }));
  const pc = (brand.platform_counts || {}) as Record<string, number>;
  const top = Object.entries((brand.verticals || {}) as Record<string, number>).filter(([k]) => k !== "Other").sort((a, b) => b[1] - a[1])[0];
  return (
    <div>
      <div className="card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="label">Brand</span>
              {brand.category && <Link href={`/brands?cat=${encodeURIComponent(brand.category)}`} className="pill hover:border-accent hover:text-accent">{brand.category}</Link>}
              {brand.is_mass_sponsor && <span className="pill">mass sponsor</span>}
              {brand.is_self_brand && <span className="pill-warn">creator-owned</span>}
            </div>
            <h1 className="h2 text-3xl">{brand.website ? <a href={brand.website} target="_blank" rel="noreferrer" className="hover:text-accent">{brand.name} <span className="font-mono text-sm text-dim">↗</span></a> : brand.name}</h1>
            <p className="num mt-2 text-[11px] text-muted">{brand.creator_count} creators booked · {brand.deal_count} deals{pc.youtube ? ` · YT ${pc.youtube}` : ""}{pc.instagram ? ` · IG ${pc.instagram}` : ""}{brand.last_seen ? ` · last seen ${brand.last_seen}` : ""}</p>
            {top && <p className="mt-3 text-sm text-muted">Books mostly <span className="font-medium text-fg">{top[0]}</span> creators{Object.keys(brand.verticals || {}).length > 1 ? ", plus the verticals below" : ""}.</p>}
          </div>
          <div className="w-full max-w-sm">
            <div className="label mb-2">Verticals booked</div>
            <Verticals v={brand.verticals} bar />
          </div>
        </div>
      </div>

{profile && <BrandScan brandId={brand.id} brandName={brand.name} last={(lastScan as any) || null} />}
      {hiring.length > 0 && (
        <div className="card mb-6 border-ok/40 p-4">
          <div className="label mb-1">Hiring now</div>
          {hiring.map((h) => <div key={h.id} className="text-[13px]"><a href={h.url} target="_blank" rel="noreferrer" className="font-medium hover:text-accent">{h.title}</a>{h.seniority && <span className="pill ml-2">{h.seniority}</span>} <span className="num text-[10.5px] text-muted">· {h.closed_at ? `filled ${new Date(h.closed_at).toLocaleDateString()}` : `open since ${new Date(h.posted_at || h.found_at).toLocaleDateString()}`}</span>{h.summary && <div className="text-[11.5px] text-dim">{h.summary}</div>}</div>)}
          <div className="num mt-2 text-[10.5px] text-ok">{hiring.some((h) => !h.closed_at) ? "Budget approved and nobody in the seat yet: pitch the VP of Marketing with a creator ready now." : "The seat is filled: the new hire is building a list from scratch. Pitch them directly."}</div>
        </div>
      )}
            <BookingMap deals={deals} />

      <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {(rows || []).map((r: any) => (
          <Link key={r.creator_id} href={`/c/${r.creators.platform}/${r.creators.handle}`} className="card flex items-center gap-3 p-4 transition hover:border-accent hover:shadow-pop">
            {r.creators.avatar_url ? <img src={r.creators.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="h-10 w-10 rounded-full bg-surface2" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="truncate font-medium">{r.creators.display_name || r.creators.handle}</span>{r.creators.category && r.creators.category !== "Other" && <span className="pill shrink-0">{r.creators.category}</span>}</div>
              <div className="num text-[10px] text-muted">{r.creators.platform === "youtube" ? "YT" : "IG"} · {fmt(r.creators.followers)} · {r.deals} {Number(r.deals) === 1 ? "deal" : "deals"}{r.repeat_partner ? " · repeat" : ""}</div>
              <div className="mt-1 line-clamp-1 text-xs text-dim">{r.evidence}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
