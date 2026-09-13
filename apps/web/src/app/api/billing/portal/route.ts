import { NextResponse } from "next/server";
import { currentProfile } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";

// Stripe customer portal: change plan, update card, cancel.
export async function POST() {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (!profile.stripe_customer_id) return NextResponse.json({ error: "No subscription yet" }, { status: 400 });
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://sponsorprint.com";
  const session = await stripe().billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: `${base}/settings` });
  return NextResponse.json({ url: session.url });
}
