import { describe, it, expect } from "vitest";
import { dealType, trackerBrand } from "./dealtype";

// Evidence strings are real rows from two channels pulled on Nov 18 2026.
describe("dealType", () => {
  const h = "apprenticediary";
  it("sponsored", () => {
    expect(dealType("Sponsorship Mention", "sponsored by Elegoo")).toBe("Sponsored");
    expect(dealType("", "Thanks FlexiSpot for sponsoring", h)).toBe("Sponsored");
  });
  it("gifted", () => {
    expect(dealType("Product Seeding", "provided by Sumo Gear.")).toBe("Gifted");
    expect(dealType("", "thanks to Elegoo for sending")).toBe("Gifted");
  });
  it("affiliate, referral and code links", () => {
    expect(dealType("Link only", "https://try.printify.com/apprenticediary", h)).toBe("Affiliate");
    expect(dealType("Link only", "https://vidiq.com/apprenticediary", h)).toBe("Affiliate");
    expect(dealType("Link only", "Get your website and web hosting for your Ecommerce business at https://hostinger.com/apprenticediary, choose a plan and", h)).toBe("Affiliate");
    expect(dealType("Link only", "https://go.fiverr.com/visit/?bta=1101090&brand=fiverrcpa&afp=apprenticediary&utm_campaign=v1", h)).toBe("Affiliate");
    expect(dealType("Link only", "- Sellerboard for keeping track of profit and expenses: https://sellerboard.com/?friend=e465f82a36", h)).toBe("Affiliate");
    expect(dealType("Link only", "- Smartscout for brand direct and wholesale: https://smartscout.com?fpr=apprentice", h)).toBe("Affiliate");
    expect(dealType("Link only", "- Keepa for product research: https://get.keepa.com/dp2f62", h)).toBe("Affiliate");
    expect(dealType("Link only", "🔗 **Chase Ink Credit Card Referral** https://www.referyourchasecard.com/21q/YZAOK6I5WY", h)).toBe("Affiliate");
    expect(dealType("Link only", "⭐ Start making guided journals with BookBolt: https://affiliate.bookbolt.io/idevaffiliate.php?id=7367&url=952", h)).toBe("Affiliate");
    expect(dealType("Link only", "https://shopify.pxf.io/c/5676581/1945365/13624", h)).toBe("Affiliate");
    expect(dealType("Discount Code", "Start your email marketing campaign to recover sales for free today with Omnisend and get 30% discount for paid tiers us", h)).toBe("Affiliate");
    expect(dealType("Discount Code", "Get 35% off LLC plans from Tailor Brands and Setup your LLC today with my affiliate link: https://tailorbrands.go2cloud.", h)).toBe("Affiliate");
  });
  it("plain mentions stay mentions", () => {
    const e = "theeverydaybuild";
    expect(dealType("Link only", "printables.com/model", e)).toBe("Mention");
    expect(dealType("Link only", "thingiverse.com/thing", e)).toBe("Mention");
    expect(dealType("Link only", "https://makerworld.com/models", e)).toBe("Mention");
    expect(dealType("Link only", "allaboutthebuild.com/workshop", e)).toBe("Mention");
    expect(dealType("Hashtag only", "#aliexpress (hashtag in description)", e)).toBe("Mention");
    expect(dealType("Link only", "DOWNLOAD THE MAINTENANCE REFERENCE GUIDE HERE:  https://www.etsy.com/listing/4418599116/maintenance-reference-guide-80-s", e)).toBe("Mention");
    expect(dealType("Link only", "Grab the diagram here 👉 https://www.etsy.com/listing/1795480598/front-axle-reference-diagram-80-series", e)).toBe("Mention");
  });
});
describe("trackerBrand", () => {
  it("reads the brand off an affiliate-network link", () => {
    expect(trackerBrand("with my affiliate link: https://tailorbrands.go2cloud.org/aff_c?offer_id=1")).toBe("tailorbrands");
    expect(trackerBrand("https://shopify.pxf.io/c/5676581/1945365/13624")).toBe("shopify");
    expect(trackerBrand("https://try.printify.com/apprenticediary")).toBe(null);
    expect(trackerBrand("Setup your LLC today with my affiliate link: https://tailorbrands.go2cloud.")).toBe("tailorbrands");
    expect(trackerBrand("thingiverse.com/thing")).toBe(null);
  });
});
