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

// Real rows from a third channel (smart home, many sponsors) pulled the same day.
describe("dealType: thank-you sponsors, signal tags, negation", () => {
  const h = "ericwelander";
  it("thank-you sponsorships are sponsored even when the stored evidence is cut short", () => {
    expect(dealType("Thank You Sponsorship, Affiliate", "Thanks to ECOVACS for supporting", h)).toBe("Sponsored");
    expect(dealType("Thank You Sponsorship, Affiliate", "Thanks to eufy for", h)).toBe("Sponsored");
    expect(dealType("Thank You Sponsorship, Discount Code, Affiliate", "Thanks to Dreame for", h)).toBe("Sponsored");
    expect(dealType("Discount Code, Affiliate", "Check out the Avia Smart Deadbolt+ https://timf.io/41ID5zU from our video sponsor", h)).toBe("Sponsored");
    expect(dealType("Link only", "Thanks to TRMNL for sponsoring this video! Use this link and get $10 off https://usetrmnl.com/go/ericwelander10", h)).toBe("Sponsored");
  });
  it("gifted beats a generic signal tag", () => {
    expect(dealType("", "Thanks to Hisense for sending", h)).toBe("Gifted");
    expect(dealType("", "Thanks to Ubiquiti for sending", h)).toBe("Gifted");
  });
  it("the scanner's affiliate tag counts", () => {
    expect(dealType("Affiliate", "#EcoFlow (hashtag in description)", h)).toBe("Affiliate");
    expect(dealType("Affiliate", "https://beatbot.com/pages", h)).toBe("Affiliate");
    expect(dealType("Link only", "UNAS Pro https://store.ui.com/us/en/products/unas-pro?a_aid=EricWelander", h)).toBe("Affiliate");
    expect(dealType("Link only", "Keychron K3 HE https://www.keychron.com/pages/k3he-k3-ultra-prelaunch?ref=ERICWELANDER (Affiliate link)", h)).toBe("Affiliate");
    expect(dealType("Link only", "Use code NUKI15ERICW to get 15% off this Nuki lock bundled with keypad https://geni.us/xtbydI", h)).toBe("Affiliate");
  });
  it("a stated non-affiliate link is a mention", () => {
    expect(dealType("Link only", "LaFaer Wireless Human Presence Sensor LWR01 https://lafaer.co/products/human-presence-sensor-lwr01 (Not an affiliate lin", h)).toBe("Mention");
    expect(dealType("Link only", "LaFaer sensor https://lafaer.co/products/x (Not an affiliate link)", h)).toBe("Mention");
  });
  it("news and product links stay mentions", () => {
    expect(dealType("Link only", "The US government just banned Roombas | The Verge — https://www.theverge.com/policy/972312/us-robot-ban", h)).toBe("Mention");
    expect(dealType("Link only", "Sonos Beam Ultra: The TV Soundbar with Dolby Atmos — https://www.sonos.com/en-us/shop/beam-ultra", h)).toBe("Mention");
    expect(dealType("Hashtag only", "#Aqara (hashtag in description)", h)).toBe("Mention");
  });
  it("impact-network links name the brand", () => {
    expect(trackerBrand("Check out CleanMyMac and get 10% off https://macpaw.audw.net/c/2744270/3874567/1733")).toBe("macpaw");
  });
});
