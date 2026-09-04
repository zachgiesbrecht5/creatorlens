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
      <section className="py-16 text-center md:py-24">
        <div className="label mb-6">Creator intelligence</div>
        <h1 className="h1 mx-auto max-w-4xl">
          Every brand a creator has worked with. In twenty seconds.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-muted">
          Type a YouTube or Instagram handle. We read their public content, find the sponsors, show you who to contact, and drop a pitch draft in your Gmail.
        </p>
        <div className="mx-auto mt-10 max-w-2xl">
          <SearchBox signedIn={!!user} />
        </div>
        <p className="mt-4 font-mono text-[11px] text-dim">
          {creators ?? 0} creators · {brands ?? 0} brands · {deals ?? 0} deals in the shared database
        </p>
      </section>

      {recent && recent.length > 0 && (
        <section className="mt-4">
          <div className="label mb-4">Recently scanned</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {recent.map((c) => (
              <Link key={c.platform + c.handle} href={`/c/${c.platform}/${c.handle}`} className="card flex items-center gap-3 p-3 transition hover:border-fg">
                {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-surface2" />}
                <div className="min-w-0">
                  <div className="truncate text-sm">{c.display_name || c.handle}</div>
                  <div className="truncate font-mono text-[10px] text-dim">{c.platform === "youtube" ? "YT" : "IG"} · {fmt(c.followers)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
        <Step n="01" title="Scan" body="Paste a handle. We read up to two years of videos or 100 posts through the official APIs. No keys, no setup." />
        <Step n="02" title="See the brand wall" body="Every sponsor, gifted deal, and affiliate, with the evidence line and the post it came from. Repeat partners flagged." />
        <Step n="03" title="Pitch" body="Hover a brand for the contact. Click Draft: your pitch style plus the deal evidence becomes a Gmail draft you review and send." />
      </section>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="bg-surface p-8">
      <div className="label">{n}</div>
      <h3 className="mt-4 text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
