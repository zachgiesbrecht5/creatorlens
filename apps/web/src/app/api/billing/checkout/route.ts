import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { stripe, PRICES } from "@/lib/stripe";
import { track, alert } from "@/lib/track";

// POST { plan: "pro"|"agency", interval: "monthly"|"yearly", code?: string } -> Stripe Checkout URL
//
// Discount rules (Stripe Checkout accepts ONE of allow_promotion_codes / discounts, never both,
// so codes are collected on our pricing page instead of Stripe's "Add promotion code" box):
//  - A "free first month" code (100% off, duration once) becomes a 30-day trial, so it can't
//    zero out a whole yearly plan and founding users keep their 30% forever on top of it.
//  - Any other valid code is applied as the discount (it replaces the founding coupon).
//  - No code: founding users get STRIPE_FOUNDING_COUPON automatically.
export async function POST(req: Request) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Billing isn't set up yet." }, { status: 503 });
  const { plan, interval: rawInterval, code: rawCode } = await req.json().catch(() => ({}));
  const interval = rawInterval === "yearly" ? "yearly" : "monthly";
  const price = PRICES[`${plan}_${interval}`];
  if (!price) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  const code = typeof rawCode === "string" ? rawCode.trim() : "";

  try {
    const s = stripe();
    const founding = !!profile.founding && !!process.env.STRIPE_FOUNDING_COUPON;

    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
    let trialDays: number | undefined;
    let appliedCode: string | undefined;

    if (code) {
      const found = await s.promotionCodes.list({ code, active: true, limit: 1, expand: ["data.coupon"] });
      const promo = found.data[0];
      const coupon = promo?.coupon as Stripe.Coupon | undefined;
      const expired = promo?.expires_at && promo.expires_at * 1000 < Date.now();
      const usedUp = promo?.max_redemptions != null && promo.times_redeemed >= promo.max_redemptions;
      if (!promo || !coupon?.valid || expired || usedUp) return NextResponse.json({ error: "That code isn't valid." }, { status: 400 });
      if (promo.restrictions?.first_time_transaction && profile.stripe_subscription_id) return NextResponse.json({ error: "That code is for new subscribers." }, { status: 400 });
      appliedCode = promo.code;
      const freeFirstMonth = coupon.percent_off === 100 && coupon.duration === "once";
      if (freeFirstMonth) {
        trialDays = 30;
        if (founding) discounts = [{ coupon: process.env.STRIPE_FOUNDING_COUPON! }];
      } else {
        discounts = [{ promotion_code: promo.id }];
      }
    } else if (founding) {
      discounts = [{ coupon: process.env.STRIPE_FOUNDING_COUPON! }];
    }

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
      ...(discounts ? { discounts } : {}),
      payment_method_collection: "always",
      success_url: `${base}/settings?upgraded=1`, cancel_url: `${base}/pricing`,
      subscription_data: {
        metadata: { user_id: profile.id, ...(appliedCode ? { promo_code: appliedCode } : {}) },
        ...(trialDays ? { trial_period_days: trialDays } : {}),
      },
      client_reference_id: profile.id,
    });
    track(profile.id, "checkout_started", { plan, interval, code: appliedCode || null, founding });
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    alert("checkout failed", { user: profile.id, plan, interval, code: code || null, error: e?.message });
    return NextResponse.json({ error: "Checkout couldn't start. Try again in a minute." }, { status: 500 });
  }
}
