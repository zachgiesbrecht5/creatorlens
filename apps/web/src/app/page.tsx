import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { supabaseAdmin, currentUser } from "@/lib/supabase";
import { fmt } from "@/lib/fmt";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  const admin = supabaseAdmin();
  const [{ count: creators }, { count: brands }, { count: deals }, { data: recent }] = await Promise.all([
    admin.from("creators").select("*", { count: "exact", head: true }),
    admin.from("brands").select("*", { count: "exact", head: true }),
    admin.from("partnerships").select("*", { count: "exact", head: true }),
    admin.from("creators").select("platform,handle,display_name,avatar_url,followers").order("last_scanned_at", { ascending: false }).limit(12),
  ]);

  return (
    <div>
      <section className="grid-bg -mx-6 -mt-10 px-6 pb-16 pt-20 text-center md:pt-28">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] text-muted shadow-card">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Creator sponsorship intelligence
        </div>
        <h1 className="h1 mx-auto max-w-4xl">
          Every brand a creator has worked with. In twenty seconds.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted">
          Type a YouTube or Instagram handle. Sponsorprint reads their public content, finds the sponsors, shows you who to contact, and places a pitch draft in your Gmail.
        </p>
        <div className="mx-auto mt-10 max-w-2xl">
          <SearchBox signedIn={!!user} />
        </div>
        <p className="num mt-5 text-[11px] text-dim">
          {(creators ?? 0).toLocaleString()} creators · {(brands ?? 0).toLocaleString()} brands · {(deals ?? 0).toLocaleString()} deals indexed
        </p>
      </section>

      {recent && recent.length > 0 && (
        <section className="mt-4">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="label">Recently scanned</div>
            <div className="font-mono text-[11px] text-dim">live</div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            {recent.map((c) => (
              <Link key={c.platform + c.handle} href={`/c/${c.platform}/${c.handle}`} className="card flex items-center gap-3 p-3 transition hover:border-accent hover:shadow-pop">
                {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-surface2" />}
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{c.display_name || c.handle}</div>
                  <div className="num truncate text-[10px] text-dim">{c.platform === "youtube" ? "YT" : "IG"} · {fmt(c.followers)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-20 grid gap-px overflow-hidden rounded-xl border border-line bg-line shadow-card md:grid-cols-3">
        <Step n="01" title="Scan" body="Paste a handle. Up to two years of videos or 100 posts are read through the official APIs. No keys, no setup." />
        <Step n="02" title="Read the print" body="Every sponsor, gifted deal and affiliate, with the evidence line and the post it came from. Repeat partners flagged." />
        <Step n="03" title="Pitch" body="Hover a brand for the contact. Click Draft: your pitch style plus the deal evidence becomes a Gmail draft you review and send." />
      </section>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="bg-surface p-8">
      <div className="num text-[11px] text-accent">{n}</div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
