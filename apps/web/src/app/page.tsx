import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { supabaseAdmin, currentAccess } from "@/lib/supabase";
import { fmt } from "@/lib/fmt";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile: user, insider } = await currentAccess();
  const admin = supabaseAdmin();
  const [{ count: creators }, { count: brands }, { count: deals }] = await Promise.all([
    admin.from("creators").select("*", { count: "exact", head: true }),
    admin.from("brands").select("*", { count: "exact", head: true }),
    admin.from("partnerships").select("*", { count: "exact", head: true }),
  ]);
  // Recently scanned: the whole index for the house, only your own unlocks otherwise.
  let recent: { platform: string; handle: string; display_name: string | null; avatar_url: string | null; followers: number | null }[] = [];
  if (insider) {
    recent = (await admin.from("creators").select("platform,handle,display_name,avatar_url,followers").order("last_scanned_at", { ascending: false }).limit(12)).data || [];
  } else if (user) {
    const { data: mine } = await admin.from("creator_access").select("platform,handle").eq("user_id", user.id).order("created_at", { ascending: false }).limit(24);
    if (mine?.length) recent = ((await admin.from("creators").select("platform,handle,display_name,avatar_url,followers").in("handle", mine.map((m) => m.handle)).limit(12)).data || []);
  }

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
          Built for creator managers. Type any creator's YouTube or Instagram handle, see every brand they've worked with and the post that proves it, then pitch the right contact for your own talent from your Gmail in one click.
        </p>
        <div className="mx-auto mt-10 max-w-2xl">
          <SearchBox signedIn={!!user} />
        </div>
        <p className="num mt-5 text-[11px] text-dim">
          {(brands ?? 0) >= 1000
            ? `${(creators ?? 0).toLocaleString()} creators · ${(brands ?? 0).toLocaleString()} brands · ${(deals ?? 0).toLocaleString()} deals indexed`
            : `${(deals ?? 0).toLocaleString()} deals found so far, each with the post that proves it · public data only · drafts, never sends`}
        </p>
      </section>

      {recent && recent.length > 0 && (
        <section className="mt-4">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="label">{insider ? "Recently scanned" : "Your creators"}</div>
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

      <section className="mt-16 grid items-start gap-8 md:grid-cols-5">
        <div className="md:col-span-2">
          <div className="label mb-2">What the draft looks like</div>
          <h2 className="h2">Written for your creator, backed by the other brand's deals.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The pitch is for the talent you represent. The scanned creator's sponsors are the evidence that this brand books people like yours. Your style guide sets the voice, your signature closes it, and nothing is sent until you hit send.
          </p>
          <p className="mt-6 font-mono text-[11px] text-dim">Real draft, contact redacted.</p>
        </div>
        <div className="card overflow-hidden md:col-span-3">
          <div className="border-b border-line bg-surface2 px-5 py-3 font-mono text-[11px] text-muted">
            <div><span className="text-dim">To</span> &nbsp; t.h@jcrew.com</div>
            <div className="mt-1"><span className="text-dim">Subject</span> &nbsp; Andy Yen for J.Crew's fall home campaign</div>
          </div>
          <div className="space-y-4 px-5 py-5 text-[13.5px] leading-relaxed">
            <p>Andy turns his LA loft into content that gets product placed inside the story. His best recent piece, converting the open loft into a guest room, hit 1.8M views with every product linked in his ShopMy.</p>
            <p>He's known for interior builds, hosting moments, and scenes with his cats Juji and Shuko. His audience comes for the aesthetic and the approachable DIY. 204K followers across platforms.</p>
            <p>Since you've been working with lifestyle creators, I thought he might fit a fall hosting setup or a loft refresh featuring your knitwear and home pieces. He's currently working with adidas, IKEA, Logitech and Fancy Feast.</p>
            <p>Does a placement like this fit into your Q4 or Q1 plans?</p>
            <p className="text-muted">Thanks,<br />Z<br /><span className="font-mono text-[11px] text-dim">[your signature, appended automatically]</span></p>
          </div>
        </div>
      </section>

      <section className="mt-16 card flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div>
          <div className="label mb-1">Pricing</div>
          <div className="text-sm">Free while in beta. Sign in with Google, get 5 scans and 3 drafts to start, and keep going at no charge if you share what worked and what didn't.</div>
          <div className="mt-1 font-mono text-[11px] text-dim">Paid plans are coming. Beta users keep a founding discount for good.</div>
        </div>
        {!user && <Link href="/login" className="btn-primary">Start scanning</Link>}
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
