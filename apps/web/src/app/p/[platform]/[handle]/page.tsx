import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicPrint, fmtK, monthLabel } from "@/lib/public-print";
import { PrintTimeline } from "@/components/PrintTimeline";
import { ShareBar } from "@/components/ShareBar";

// The public print. No login, indexable, shareable. Shows who paid the
// creator and when; the contacts, evidence and pitch live behind sign-in.
type P = { params: Promise<{ platform: string; handle: string }> };
const base = process.env.NEXT_PUBLIC_APP_URL || "https://sponsorprint.com";

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { platform, handle } = await params;
  const d = await publicPrint(platform, handle);
  if (!d) return { title: "Sponsorprint" };
  const name = d.creator.display_name || `@${d.creator.handle}`;
  const title = `${name}'s sponsor print: ${d.brands.length} brands, ${d.deals} deals`;
  const desc = `Every brand that has publicly sponsored ${name} on ${platform === "youtube" ? "YouTube" : "Instagram"}: ${d.brands.slice(0, 5).map((b) => b.name).join(", ")}${d.brands.length > 5 ? " and more" : ""}.`;
  const og = `${base}/api/og/print?platform=${platform}&handle=${encodeURIComponent(d.creator.handle)}`;
  return { title, description: desc, openGraph: { title, description: desc, images: [{ url: og, width: 1200, height: 630 }], type: "article" }, twitter: { card: "summary_large_image", title, description: desc, images: [og] }, alternates: { canonical: `${base}/p/${platform}/${d.creator.handle}` } };
}

export default async function PublicPrint({ params }: P) {
  const { platform, handle } = await params;
  const d = await publicPrint(platform, handle);
  if (!d) notFound();
  const c = d.creator; const name = c.display_name || `@${c.handle}`;
  const url = `${base}/p/${platform}/${c.handle}`;
  const timeline = d.brands.map((b) => ({ brand_id: b.id, brand: b.name, category: b.category, months: b.months, why: null, season: null, repeat: b.repeat, deals: b.deals }));
  return (
    <div className="mx-auto max-w-4xl">
      <div className="pw pub">
        <div className="pw-top">
          <div className="pw-id">
            {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" /> : <div className="h-16 w-16 rounded-full bg-surface2" />}
            <div>
              <div className="rc-head">{platform === "youtube" ? "YouTube" : "Instagram"} · @{c.handle}{c.category ? ` · ${c.category}` : ""}</div>
              <div className="pw-name">{name}</div>
              <div className="num text-[11.5px] text-muted">{fmtK(c.followers)} {platform === "youtube" ? "subscribers" : "followers"} · printed {new Date(c.last_scanned_at!).toLocaleDateString()}</div>
            </div>
          </div>
          <div className="pw-stats"><div><b>{d.brands.length}</b><span>brands</span></div><div><b>{d.deals}</b><span>deals</span></div><div><b className="text-ok">{d.repeats}</b><span>repeat</span></div></div>
        </div>
        {timeline.length > 0 && <PrintTimeline items={timeline} />}
        <div className="pw-head"><span>brand</span><span>category</span><span>first</span><span>last</span><span>deals</span></div>
        {d.brands.map((b) => (
          <div key={b.id} className="pub-row">
            <span className="font-sans text-[15px] font-semibold tracking-tight">{b.name}{b.repeat && <em className="ml-2 font-mono text-[9.5px] font-normal text-ok">repeat</em>}</span>
            <span className="num text-[11px] text-muted">{b.category || ""}</span>
            <span className="num text-[11.5px]">{monthLabel(b.first)}</span>
            <span className="num text-[11.5px]">{monthLabel(b.last)}</span>
            <span className="num text-[12px]">{b.deals}</span>
          </div>
        ))}
        <div className="pw-foot"><span>{d.brands.length} brands · {d.deals} deals · public posts only</span><span>sponsorprint.com</span></div>
        <div className="rc-tear" />
      </div>
      <ShareBar url={url} name={name} og={`${base}/api/og/print?platform=${platform}&handle=${encodeURIComponent(c.handle)}`} />
      <div className="mt-6 rounded-xl bg-fg p-5 text-white">
        <div className="text-[15px] font-semibold">Who to email at these brands, the post that proves each deal, and a pitch written for your creator.</div>
        <div className="mt-1 text-[13px] text-white/70">That's the paid side of the print. Free to start.</div>
        <Link href={`/login?next=/c/${platform}/${c.handle}`} className="mt-3 inline-block rounded-md bg-white px-4 py-2 text-[13px] font-semibold text-fg">Open the full print →</Link>
      </div>
    </div>
  );
}
