import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { PrintReceipt } from "@/components/PrintReceipt";
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
      {/* Hero: the print is the product. Headline left, the machine on the right. */}
      <section className="-mx-6 -mt-10 border-b border-line bg-surface px-6 pb-14 pt-14 md:pt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-12">
          <div className="md:col-span-6">
            <h1 className="h1 max-w-xl">Pull a creator&apos;s sponsor print.</h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
              Every brand that has paid them, the post that proves it, and the person to email. Twenty seconds from a handle to a pitch for your own talent.
            </p>
            <div className="mt-8 max-w-xl">
              <SearchBox signedIn={!!user} cta="Pull the print" />
            </div>
            <p className="mt-4 text-[13px] text-dim">Public posts only, read through the official YouTube and Instagram APIs. Nothing is ever sent for you.</p>
          </div>
          <div className="md:col-span-6 md:pl-6">
            <PrintReceipt indexDeals={deals ?? 0} />
          </div>
        </div>
      </section>

      {recent && recent.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="text-sm font-medium">{insider ? "Recently printed" : "Your prints"}</div>
            <div className="text-[12px] text-dim">tap one to open it</div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            {recent.map((c) => (
              <Link key={c.platform + c.handle} href={`/c/${c.platform}/${c.handle}`} className="card flex items-center gap-3 p-3 transition hover:border-fg">
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

      {/* The journey is a real sequence, so a rail with three stops is honest here. */}
      <section className="mt-20">
        <h2 className="h2">From handle to pitch</h2>
        <div className="rail mt-8 grid gap-10 md:grid-cols-3">
          <Stop title="Type a handle" body="YouTube or Instagram. Up to two years of videos or the last hundred posts are read in about twenty seconds. If someone already pulled this print, it opens instantly and costs nothing." />
          <Stop title="Read the print" body="Every sponsor, gifted deal and affiliate, with the caption line that gave it away and a link to the post. Brands that came back are marked repeat, because a brand that books twice is the one to call." />
          <Stop title="Pitch your talent" body="Hover a brand for the right person. One click writes the email in your voice, for the creator you represent, using this brand's real creator history as the reason to say yes. It opens in your Gmail. You send it." />
        </div>
      </section>

      <section className="mt-24 grid items-start gap-10 md:grid-cols-12">
        <div className="md:col-span-5">
          <h2 className="h2">What comes out the other end</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
            The scanned creator is the evidence. The pitch is for someone on your roster. Your style guide sets the voice, your signature closes it, and the brand&apos;s own booking history is the argument.
          </p>
          <p className="mt-6 text-[12px] text-dim">Illustrative. Names, brand and figures are invented.</p>
        </div>
        <div className="md:col-span-7">
          <div className="border-l-2 border-line pl-6 text-[14.5px] leading-relaxed">
            <div className="num text-[11px] text-dim">To d.reyes@hearthline.co</div>
            <div className="num mb-5 text-[11px] text-dim">Subject: Priya Nair for Hearthline&apos;s holiday cookware push</div>
            <p>Hi Dana,</p>
            <p className="mt-4">You booked @thekitchenlab in August for the Dutch oven launch, so I think you already know the format that works: a real weeknight cook, product in hand, no studio. Priya Nair (@priyacooks, 312K on Instagram, 140K on YouTube) does exactly that, one-pot dinners for families, filmed in her own kitchen, with a save rate about three times the category average.</p>
            <p className="mt-4">For the holiday window she could do a two-part braise series built around your enameled line, with a swipe-up to your gift bundles. Her audience is 78% women 28 to 44, mostly US and Canada, the same profile that bought through her Le Petit Four collab last winter.</p>
            <p className="mt-4">Is there room in your Q4 plan for a creator like Priya? Happy to send her rate card and three concept options.</p>
            <p className="mt-4 text-muted">Best,<br />Jordan</p>
          </div>
        </div>
      </section>

      <section className="mt-24 flex flex-wrap items-center justify-between gap-6 border-t border-line pt-10">
        <div className="max-w-xl">
          <div className="text-lg font-semibold tracking-tight">Free while in beta.</div>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">Sign in with Google, get 5 prints and 3 drafts to start, and keep going at no charge if you tell us what worked. Paid plans are coming; beta users keep a founding discount for good.</p>
        </div>
        {!user && <Link href="/login" className="btn-dark">Pull your first print</Link>}
      </section>
    </div>
  );
}

function Stop({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="rail-dot" />
      <h3 className="mt-4 text-[17px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}
