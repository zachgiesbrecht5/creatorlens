import { describe, it, expect, beforeEach } from "vitest";
import { detectYouTube, extractBrands, scoreSignals, normalizeBrandName, buildSelfRefKeys } from "./youtube";
import { detectInstagram, guessBrand } from "./instagram";
import { matchCategory } from "./categories";
import { addLearnedAliases, resetAliases, isLearnable } from "./registry";
import { buildBrandWall, type PartnershipRow } from "./scan";

beforeEach(() => resetAliases());

describe("YouTube detection", () => {
  it("catches explicit sponsor grammar and aliases", () => {
    const d = detectYouTube({ title: "My desk setup", description: "This video is sponsored by Squarespace. Go to squarespace.com/dave for 10% off." });
    const brands = d.map((x) => x.brand);
    expect(brands).toContain("Squarespace");
    expect(d.find((x) => x.brand === "Squarespace")!.confidenceLabel).toBe("High");
    expect(d.find((x) => x.brand === "Squarespace")!.isMassSponsor).toBe(true);
  });

  it("KAKU fix: thank-you grammar with a colon, and store links are never sponsors", () => {
    const d = detectYouTube({ title: "KAKU: Ancient Seal review", description: "Thank you to KAKU: Ancient Seal for sponsoring this video!\nGet it on Steam: https://store.steampowered.com/app/123\nhttps://www.playstation.com/games/kaku" });
    const brands = d.map((x) => x.brand);
    expect(brands.some((b) => /kaku/i.test(b))).toBe(true);
    expect(brands).not.toContain("Steampowered");
    expect(brands).not.toContain("Playstation");
    expect(brands).not.toContain("PlayStation");
  });

  it("ignores affiliate infrastructure domains", () => {
    const d = detectYouTube({ title: "Haul", description: "Use code DAVE at checkout\nhttps://shrsl.com/abc\nhttps://www.awin1.com/x" });
    expect(d.map((x) => x.brand)).not.toContain("Shrsl");
  });

  it("bare topic hashtags are not brands, partner-style hashtags are", () => {
    const d = detectYouTube({ title: "Court day", description: "#tennis #pov #sponsored #WilsonPartner" });
    const brands = d.map((x) => x.brand);
    expect(brands).not.toContain("Tennis");
    expect(brands).not.toContain("Pov");
    expect(brands).toContain("Wilson");
  });

  it("filters the channel's own name", () => {
    const self = buildSelfRefKeys("Dave2D", "@Dave2D");
    const d = detectYouTube({ title: "x", description: "Thanks to Dave2D for supporting" }, self);
    expect(d.map((x) => x.brand)).not.toContain("Dave2D");
  });

  it("normalizes with aliases", () => {
    expect(normalizeBrandName("drinkag1")).toBe("AG1");
    expect(normalizeBrandName("www.brooklinen.com")).toBe("Brooklinen");
    expect(normalizeBrandName("some new brand")).toBe("Some New Brand");
  });

  it("scores signals", () => {
    expect(scoreSignals("this video is sponsored by X. use code Y").score).toBe(11);
    expect(extractBrands("", "").length).toBe(0);
  });
});

describe("Instagram detection", () => {
  it("paid partnership with @handle near disclosure", () => {
    const f = detectInstagram("Loving my new setup #ad @fellowproducts made this so easy", "cafeandy_");
    expect(f[0].brand).toBe("Fellow");
    expect(f[0].label).toBe("High");
  });

  it("partner grammar captures unknown brands", () => {
    const f = detectInstagram("So excited to be collaborating with soltech on the lamp of my dreams", "andyyyen");
    expect(f[0].brand).toBe("Soltech");
    expect(f[0].score).toBe(6);
  });

  it("product-from grammar with commerce context", () => {
    const f = detectInstagram("The Opus 2 from @fellowproducts. $200, link in my bio.");
    expect(f[0].brand).toBe("Fellow");
    expect(f[0].type).toBe("Product from @brand + promo");
  });

  it("RISKY words only match capitalized", () => {
    expect(detectInstagram("an aura of calm this morning #ad").some((f) => f.brand === "Aura")).toBe(false);
    expect(detectInstagram("my new Aura frame #ad").some((f) => f.brand === "Aura")).toBe(true);
  });

  it("family dedupe collapses hashtag variants and caps at 3", () => {
    const f = detectInstagram("#VITURE #VITUREbeast #ad @viture @nike @adidas @lululemon @gymshark");
    expect(f.length).toBeLessThanOrEqual(3);
    expect(f.filter((x) => /viture/i.test(x.brand)).length).toBe(1);
  });

  it("guesses a brand when paid but unknown", () => {
    const f = detectInstagram("Obsessed with my Kobo Libra Colour setup #ad");
    expect(f[0].brand).toBe("Kobo");
    const g = detectInstagram("Best day ever #BarbourWayOfLife #ad");
    expect(g[0].brand).toBe("Barbour");
    expect(guessBrand("something #OLG #ad", 10)).toBe("OLG");
  });

  it("never flags the creator's own handle", () => {
    const f = detectInstagram("#ad @jimmyeverydayy x @someclothingbrand", "jimmyeverydayy");
    expect(f.some((x) => x.brand === "@jimmyeverydayy")).toBe(false);
  });

  it("returns nothing for organic captions", () => {
    expect(detectInstagram("Sunday walk with the dog @mybestfriend")).toEqual([]);
  });
});

describe("registry", () => {
  it("learned aliases are volume-gated", () => {
    expect(isLearnable("Cozy Earth", 3)).toBe(true);
    expect(isLearnable("Soltech", 4)).toBe(false);
    expect(isLearnable("Soltech", 5)).toBe(true);
    expect(isLearnable("Home", 50)).toBe(false);
    expect(isLearnable("Kobo (?)", 50)).toBe(false);
    expect(addLearnedAliases({ soltech: "Soltech", nike: "NIKE-OVERRIDE" })).toBe(0);
    expect(addLearnedAliases({ quince: "Quince" })).toBe(1);
    expect(normalizeBrandName("quince")).toBe("Quince");
  });
});

describe("categories", () => {
  it("fuzzy matches", () => {
    expect(matchCategory("dog mom vlogs")).toBe("Pets");
    expect(matchCategory("trav")).toBe("Travel");
    expect(matchCategory("")).toBe("Other");
  });
});

describe("brand wall", () => {
  const row = (brand: string, date: string, label: "High" | "Medium" | "Low" = "High"): PartnershipRow => ({
    platform: "youtube", brand, confidenceScore: label === "High" ? 8 : 3, confidenceLabel: label, signalType: "", evidence: "e",
    isMassSponsor: false, contentId: "v", contentTitle: "t", contentUrl: "u", publishedAt: date, views: 1, thumbnail: "",
  });
  it("rolls up deals and flags repeat partners", () => {
    const wall = buildBrandWall([row("Stanley", "2026-01-01"), row("Stanley", "2026-03-01"), row("Owala", "2026-02-01"), row("Junk", "2026-02-01", "Low")]);
    expect(wall.map((c) => c.brand)).toEqual(["Stanley", "Owala"]);
    expect(wall[0].deals).toBe(2);
    expect(wall[0].repeatPartner).toBe(true);
    expect(wall[1].repeatPartner).toBe(false);
  });
});

import { dropBoilerplate } from "./scan";
describe("dropBoilerplate", () => {
  const row = (brand: string, id: string, evidence = "https://x.com link") => ({ platform: "youtube", brand, confidenceScore: 5, confidenceLabel: "High", signalType: "", evidence, isMassSponsor: false, contentId: id, contentTitle: "", contentUrl: "", publishedAt: "", views: 0, thumbnail: "" } as any);
  it("drops a URL-only brand present in most videos, keeps real sponsors", () => {
    const rows = [...Array.from({ length: 12 }, (_, i) => row("Sixteenth", "v" + i)), row("Shopify", "v1", "Thanks Shopify for sponsoring"), row("Lowes", "v2")];
    dropBoilerplate(rows, 20);
    expect(rows.map((r) => r.brand)).toEqual(["Shopify", "Lowes"]);
  });
  it("keeps a brand that is explicitly thanked even if frequent", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row("Shopify", "v" + i, "Thanks Shopify for sponsoring"));
    dropBoilerplate(rows, 20);
    expect(rows.length).toBe(12);
  });
});
