import Stripe from "stripe";

// Stripe client + plan map. Price ids live in Railway:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY,
//   STRIPE_PRICE_AGENCY_MONTHLY, STRIPE_PRICE_AGENCY_YEARLY,
//   STRIPE_FOUNDING_COUPON (optional: applied to founding users forever)
export const stripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-12-18.acacia" as any });

export const PRICES: Record<string, string | undefined> = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  agency_monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY,
  agency_yearly: process.env.STRIPE_PRICE_AGENCY_YEARLY,
};

export function planForPrice(priceId: string | null | undefined): "pro" | "agency" | null {
  if (!priceId) return null;
  if (priceId === PRICES.pro_monthly || priceId === PRICES.pro_yearly) return "pro";
  if (priceId === PRICES.agency_monthly || priceId === PRICES.agency_yearly) return "agency";
  return null;
}

export const PLANS = {
  free: { name: "Free", price: 0, blurb: "Print anyone. Try the tools that book deals.", features: ["Unlimited creator prints (25 new a day)", "3 contact reveals", "3 pitch drafts", "1 brand research", "5 neighborhoods a month (15 new creators)"] },
  pro: { name: "Pro", monthly: 49, yearly: 490, blurb: "For one manager who pitches every week.", features: ["Unlimited prints, no daily limit", "Unlimited contact reveals", "60 pitch drafts a month", "15 research runs a month", "50 neighborhoods a month"] },
  agency: { name: "Agency", monthly: 149, yearly: 1490, blurb: "For a team that books at volume.", features: ["Everything in Pro", "Unlimited pitch drafts", "60 research runs a month", "200 neighborhoods a month", "5 seats, shared roster, brand map and exports"] },
} as const;
