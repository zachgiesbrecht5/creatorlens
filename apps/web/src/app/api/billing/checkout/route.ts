import { NextResponse } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { stripe, PRICES } from "@/lib/stripe";

// POST { plan: "pro"|"agency", interval: "monthly"|"yearly" } -> Stripe Checkout URL
export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Billing isn't set up yet." }, { status: 503 });
  const { plan, interval } = await req.json().catch(() => ({}));
  const price = PRICES[`${plan}_${interval || "monthly"}`];
  if (!price) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  const s = stripe();
  const admin = supabaseAdmin();
  let customer = profile.stripe_customer_id as string | null;
  if (!customer) {
    const c = await s.customers.create({ email: profile.email, name: profile.full_name || undefined, metadata: { user_id: profile.id } });
    customer = c.id;
    await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", profile.id);
  }
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://sponsorprint.com";
  const session = await s.checkout.sessions.create({
    mode: "subscription", customer,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    ...(profile.founding && process.env.STRIPE_FOUNDING_COUPON ? { discounts: [{ coupon: process.env.STRIPE_FOUNDING_COUPON }] } : {}),
    success_url: `${base}/settings?upgraded=1`, cancel_url: `${base}/pricing`,
    subscription_data: { metadata: { user_id: profile.id } },
    client_reference_id: profile.id,
  });
  return NextResponse.json({ url: session.url });
}
