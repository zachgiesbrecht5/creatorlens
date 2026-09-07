import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { fmt } from "@/lib/fmt";

export const dynamic = "force-dynamic";

// Reverse view: every creator this brand has booked. This is the casting
// intel for "who does Brand X work with" and for competitor pitches.
export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data: brand } = await admin.from("brands").select("*").eq("id", id).single();
  if (!brand) return <p>Brand not found.</p>;
  const { data: rows } = await admin.from("brand_wall").select("*, creators(handle,display_name,platform,followers,avatar_url,category)").eq("brand_id", id).order("deals", { ascending: false });
  return (
    <div>
      <div className="label mb-2">Brand</div>
      <h1 className="h2 text-3xl">{brand.website ? <a href={brand.website} target="_blank" rel="noreferrer" className="hover:text-accent">{brand.name} <span className="font-mono text-sm text-dim">↗</span></a> : brand.name}</h1>
      <p className="num mt-2 text-[11px] text-muted">{brand.creator_count} creators booked · {brand.deal_count} deals{brand.last_seen ? ` · last seen ${brand.last_seen}` : ""}</p>
      <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {(rows || []).map((r: any) => (
          <Link key={r.creator_id} href={`/c/${r.creators.platform}/${r.creators.handle}`} className="card flex items-center gap-3 p-4 transition hover:border-accent hover:shadow-pop">
            {r.creators.avatar_url ? <img src={r.creators.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="h-10 w-10 rounded-full bg-surface2" />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.creators.display_name || r.creators.handle}</div>
              <div className="num text-[10px] text-muted">{r.creators.platform === "youtube" ? "YT" : "IG"} · {fmt(r.creators.followers)} · {r.deals} {Number(r.deals) === 1 ? "deal" : "deals"}{r.repeat_partner ? " · repeat" : ""}</div>
              <div className="mt-1 line-clamp-1 text-xs text-dim">{r.evidence}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
