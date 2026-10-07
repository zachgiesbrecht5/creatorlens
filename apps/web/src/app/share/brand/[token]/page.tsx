import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { Verticals } from "@/components/Verticals";
import { BookingMap, type Deal } from "@/components/BookingMap";
import { ScanList } from "@/components/ScanList";
import { windowStatus } from "@/lib/launches";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Read-only brand page for creators, opened from a share link. Shows who the brand
// books (public, disclosed posts), when, and what it's launching. Never contacts,
// pitch history, tracker status or hiring notes.
export default async function SharedBrand({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = supabaseAdmin();
  const { data: share } = await admin.from("brand_shares").select("brand_id,revoked_at,views").eq("token", token).maybeSingle();
  if (!share || share.revoked_at) return <div className="card mx-auto mt-10 max-w-md p-8 text-center"><div className="label mb-2">Link off</div><p className="text-sm text-muted">This link has been turned off. Ask your manager for a new one.</p></div>;
  await admin.from("brand_shares").update({ views: (share.views || 0) + 1, last_viewed_at: new Date().toISOString() }).eq("token", token);
  const { data: brand } = await admin.from("brands").select("id,name,category,website,verticals,creator_count,deal_count,last_seen,platform_counts,ig_handle").eq("id", share.brand_id).single();
  if (!brand) return <p>Brand not found.</p>;

  const { data: wall } = await admin.from("brand_wall_mv").select("creator_id,deals,evidence,repeat_partner, creators(handle,display_name,platform,followers,avatar_url,category)").eq("brand_id", brand.id).order("deals", { ascending: false }).limit(200);
  const { data: dealRows } = await admin.from("partnerships").select("published_at,platform,confidence_label,content_url,creator_id,creators(id,handle,display_name,followers,category,avatar_url)").eq("brand_id", brand.id).neq("status", "rejected").not("published_at", "is", null).order("published_at", { ascending: true }).limit(500);
  const repeatIds = new Set((wall || []).filter((r: any) => r.repeat_partner).map((r: any) => r.creator_id));
  const deals: Deal[] = (dealRows || []).filter((d: any) => d.creators).map((d: any) => ({ published_at: d.published_at, platform: d.platform, confidence_label: d.confidence_label, content_url: d.content_url, repeat: repeatIds.has(d.creator_id), creator: d.creators }));
  const latestPost = new Map<string, { url: string | null; at: string }>();
  for (const d of dealRows || []) latestPost.set(d.creator_id, { url: d.content_url, at: d.published_at });
  const rows = (wall || []).filter((r: any) => r.creators).map((r: any) => ({
    platform: r.creators.platform, handle: r.creators.handle, external_id: r.creator_id, display_name: r.creators.display_name || r.creators.handle,
    avatar_url: r.creators.avatar_url, followers: r.creators.followers, category: r.creators.category && r.creators.category !== "Other" ? r.creators.category : null,
    confirmed_deals: Number(r.deals) || 0, video_title: r.evidence, post_url: latestPost.get(r.creator_id)?.url || null, new_to_index: false,
  }));
  const { data: launches } = await admin.from("launch_signals").select("id,kind,product,summary,posted_at,url,window_start,window_end,repush_month").eq("brand_id", brand.id).order("posted_at", { ascending: false }).limit(6);
  const pc = (brand.platform_counts || {}) as Record<string, number>;
  const top = Object.entries((brand.verticals || {}) as Record<string, number>).filter(([k]) => k !== "Other").sort((a, b) => b[1] - a[1])[0];

  return (
    <div>
      <div className="num mb-3 text-[11px] text-muted">Shared with you by your manager · read-only</div>
      <div className="card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2"><span className="label">Brand</span>{brand.category && <span className="pill">{brand.category}</span>}</div>
            <h1 className="h2 text-3xl">{brand.website ? <a href={brand.website} target="_blank" rel="noreferrer" className="hover:text-accent">{brand.name} <span className="font-mono text-sm text-dim">↗</span></a> : brand.name}</h1>
            <p className="num mt-2 text-[11px] text-muted">{rows.length} creators booked · {deals.length} disclosed deals{pc.youtube ? ` · YT ${pc.youtube}` : ""}{pc.instagram ? ` · IG ${pc.instagram}` : ""}{brand.last_seen ? ` · last seen ${brand.last_seen}` : ""}</p>
            {top && <p className="mt-3 text-sm text-muted">Books mostly <span className="font-medium text-fg">{top[0]}</span> creators{Object.keys(brand.verticals || {}).length > 1 ? ", plus the verticals below" : ""}.</p>}
          </div>
          <div className="w-full max-w-sm"><div className="label mb-2">Verticals booked</div><Verticals v={brand.verticals} bar /></div>
        </div>
      </div>

      {launches?.length ? (
        <section className="card mt-6 p-5">
          <div className="label">What they're launching</div>
          <div className="mb-2 text-[13px] text-muted">From {brand.name}'s own Instagram. Brands usually book a second wave of creators 4 to 8 weeks after a launch.</div>
          <div className="divide-y divide-line">{launches.map((l) => { const st = windowStatus(l); return (
            <div key={l.id} className="flex items-start justify-between gap-4 py-2.5">
              <div className="min-w-0"><div className="text-[13.5px] font-medium">{l.product || l.summary}</div><div className="num text-[10.5px] text-muted">{l.kind} · {new Date(l.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · <a href={l.url} target="_blank" rel="noreferrer" className="hover:text-accent">open post ↗</a></div></div>
              <span className={`ll-pill ${st === "open" ? "ll-open" : st === "soon" ? "ll-soon" : st === "repush" ? "ll-repush" : "ll-past"}`}>{st === "open" ? "window open" : st === "soon" ? `opens ${new Date(l.window_start!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : st === "repush" ? "re-push month" : "passed"}</span>
            </div>); })}</div>
        </section>
      ) : null}

      <section className="card mt-6 p-4">
        <div className="label mb-0.5">Who they book</div>
        <div className="text-[12.5px] text-muted">Creators with a disclosed {brand.name} post on YouTube or Instagram. Tap a post to see what they made.</div>
        <ScanList found={rows} shared />
      </section>

      <div className="mt-6"><BookingMap deals={deals} linkToPost /></div>
    </div>
  );
}
