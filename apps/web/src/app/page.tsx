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
      <section className="py-10 text-center">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Every brand a creator has worked with. <span className="text-brand">In 20 seconds.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600">
          Type a YouTube or Instagram handle. CreatorLens reads their public content, finds the sponsors, shows you who to contact, and drops a pitch draft in your Gmail.
        </p>
        <div className="mx-auto mt-8 max-w-2xl">
          <SearchBox signedIn={!!user} />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {creators ?? 0} creators · {brands ?? 0} brands · {deals ?? 0} deals in the shared database. Already-scanned creators are free to view.
        </p>
      </section>

      {recent && recent.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">Recently scanned</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {recent.map((c) => (
              <Link key={c.platform + c.handle} href={`/c/${c.platform}/${c.handle}`} className="card flex items-center gap-3 p-3 hover:border-brand">
                {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-slate-200" />}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{c.display_name || c.handle}</div>
                  <div className="truncate text-xs text-slate-500">{c.platform === "youtube" ? "YT" : "IG"} · {fmt(c.followers)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-14 grid gap-6 md:grid-cols-3">
        <Step n="1" title="Scan" body="Paste a handle. We read up to two years of videos or 100 posts through the official APIs. No keys, no setup." />
        <Step n="2" title="See the brand wall" body="Every sponsor, gifted deal, and affiliate, with the evidence line and the post it came from. Repeat partners flagged." />
        <Step n="3" title="Pitch" body="Hover a brand for the contact. Click Draft: your pitch style plus the deal evidence becomes a Gmail draft you review and send." />
      </section>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="card p-5">
      <div className="pill bg-brand-soft text-brand">Step {n}</div>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
    </div>
  );
}
