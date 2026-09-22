import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { stripe, planForPrice } from "@/lib/stripe";
import { track, alert } from "@/lib/track";

// Stripe -> profiles. Point the Stripe webhook at /api/billing/webhook with:
//   checkout.session.completed, customer.subscription.updated,
//   customer.subscription.deleted, invoice.paid
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature") || "";
  const raw = await req.text();
  let event: Stripe.Event;
  try { event = stripe().webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET || ""); }
  catch (e: any) { alert("stripe webhook bad signature", { error: e.message }); return NextResponse.json({ error: `bad signature: ${e.message}` }, { status: 400 }); }
  const admin = supabaseAdmin();

  const userFor = async (customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) => {
    const id = typeof customer === "string" ? customer : customer?.id;
    if (!id) return null;
    const { data } = await admin.from("profiles").select("id,plan").eq("stripe_customer_id", id).maybeSingle();
    return data;
  };
  const applySub = async (sub: Stripe.Subscription) => {
    const u = await userFor(sub.customer);
    if (!u) return;
    const plan = planForPrice(sub.items.data[0]?.price?.id);
    const live = ["active", "trialing", "past_due"].includes(sub.status);
    const keepHouse = u.plan === "team" || u.plan === "admin";   // never downgrade the house
    await admin.from("profiles").update({
      stripe_subscription_id: sub.id, plan_status: sub.status,
      plan_renews_at: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      ...(keepHouse ? {} : { plan: live && plan ? plan : "trial" }),
    }).eq("id", u.id);
    if (live && plan && !keepHouse) await admin.rpc("refill_plan_credits", { p_user: u.id, p_plan: plan });
    if (!keepHouse) track(u.id, live && plan ? "upgraded" : "downgraded", { plan: plan || u.plan, status: sub.status });
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.subscription) await applySub(await stripe().subscriptions.retrieve(String(s.subscription)));
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySub(event.data.object as Stripe.Subscription);
      break;
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      const u = await userFor(inv.customer);
      const plan = planForPrice(inv.lines.data[0]?.price?.id);
      if (u && plan && u.plan !== "team" && u.plan !== "admin") await admin.rpc("refill_plan_credits", { p_user: u.id, p_plan: plan });
      break;
    }
  }
  return NextResponse.json({ received: true });
}
