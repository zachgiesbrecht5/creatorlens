import { currentProfile } from "@/lib/supabase";
import { PLANS } from "@/lib/stripe";
import { PlanButton } from "@/components/PlanButton";

export const metadata = { title: "Pricing | Sponsorprint" };

export default async function Pricing() {
  const profile = await currentProfile();
  const plan = (profile?.plan || "trial") as string;
  const paid = plan === "pro" || plan === "agency" || plan === "team" || plan === "admin";
  return (
    <div className="mx-auto max-w-5xl">
      <div className="text-center">
        <div className="label mb-2">Pricing</div>
        <h1 className="h1">The prints are cheap. The pitches are the product.</h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">Print as many creators as you like, on every plan. You pay for what turns into deals: contacts, pitches written in your voice, research on the brands nobody can find, and neighborhoods of creators like yours.</p>
        {profile?.founding && !paid && <p className="mt-3 num text-[12px] text-ok">You joined in the beta, so 30% off applies at checkout for as long as you stay subscribed.</p>}
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <Card title={PLANS.free.name} price="$0" sub="forever" blurb={PLANS.free.blurb} features={[...PLANS.free.features]} cta={plan === "trial" ? "Current plan" : "Free tier"} current={plan === "trial"} />
        <Card title={PLANS.pro.name} price={`$${PLANS.pro.monthly}`} sub={`a month · $${PLANS.pro.yearly} a year`} blurb={PLANS.pro.blurb} features={[...PLANS.pro.features]} highlight current={plan === "pro"} cta={plan === "pro" ? "Current plan" : "Start Pro"} action={<PlanButton plan="pro" signedIn={!!profile} current={plan === "pro"} />} />
        <Card title={PLANS.agency.name} price={`$${PLANS.agency.monthly}`} sub={`a month · $${PLANS.agency.yearly} a year`} blurb={PLANS.agency.blurb} features={[...PLANS.agency.features]} current={plan === "agency"} cta={plan === "agency" ? "Current plan" : "Start Agency"} action={<PlanButton plan="agency" signedIn={!!profile} current={plan === "agency"} />} />
      </div>
      <p className="mt-8 text-center text-[12px] text-dim">Prices in USD. Cancel any time from Settings. Public data only; drafts, never sends.</p>
    </div>
  );
}

function Card({ title, price, sub, blurb, features, cta, action, highlight, current }: { title: string; price: string; sub: string; blurb: string; features: string[]; cta: string; action?: React.ReactNode; highlight?: boolean; current?: boolean }) {
  return (
    <div className={`card flex flex-col p-6 ${highlight ? "border-fg shadow-pop" : ""}`}>
      <div className="flex items-baseline justify-between"><h2 className="text-lg font-semibold tracking-tight">{title}</h2>{current && <span className="pill-ok">current</span>}</div>
      <div className="mt-3 flex items-baseline gap-2"><span className="text-4xl font-semibold tracking-tight">{price}</span><span className="num text-[11px] text-muted">{sub}</span></div>
      <p className="mt-2 text-sm text-muted">{blurb}</p>
      <ul className="mt-5 space-y-2 text-sm">{features.map((f) => <li key={f} className="flex gap-2"><span className="text-ok">✓</span><span>{f}</span></li>)}</ul>
      <div className="mt-6 pt-2">{action || <div className="btn-ghost w-full justify-center pointer-events-none opacity-60">{cta}</div>}</div>
    </div>
  );
}
