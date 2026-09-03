// Differential test: the ORIGINAL Apps Script detection code (loaded from
// legacy-apps-script/*.gs into a vm sandbox) vs the TypeScript port, on a
// corpus of realistic descriptions and captions. Any divergence fails.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { detectYouTube, buildSelfRefKeys } from "./youtube";
import { detectInstagram } from "./instagram";

const dir = resolve(__dirname, "../../../legacy-apps-script");
const have = existsSync(resolve(dir, "Code.gs"));

function legacy() {
  const code = readFileSync(resolve(dir, "Code.gs"), "utf8");
  const ig = readFileSync(resolve(dir, "Instagram.gs"), "utf8");
  const igbs = readFileSync(resolve(dir, "IG Brand search.gs"), "utf8");
  const pipe = readFileSync(resolve(dir, "Pipeline Scanner.gs"), "utf8");
  const slice = (src: string, start: string, end: string) => src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start)));
  const ctx: any = { Logger: { log() {} }, PropertiesService: null, SpreadsheetApp: null, UrlFetchApp: null, Utilities: null };
  vm.createContext(ctx);
  // Code.gs: everything up to the AD-HOC scan section (pure data + functions)
  vm.runInContext(code.slice(0, code.indexOf("// ── AD-HOC CHANNEL SCAN")), ctx);
  // alias packs from the other two files (IIFEs that extend BRAND_ALIASES)
  vm.runInContext(slice(igbs, "(function () {\n  if (typeof BRAND_ALIASES", "})();") + "})();", ctx);
  vm.runInContext(slice(pipe, "if (typeof BRAND_ALIASES !== \"undefined\") {", "  })();\n}") + "  })();\n}", ctx);
  // Instagram.gs: IG config + patterns + igDetect_ + igGuessBrand_, with the sheet-backed alias loader stubbed
  vm.runInContext(slice(ig, "var IG = {", "function igOnOpen_"), ctx);
  vm.runInContext(slice(ig, "var IG_PATTERNS = [", "/** Self-learning aliases"), ctx);
  vm.runInContext("function ensureLearnedAliases_(){}", ctx);
  return ctx;
}

const YT_CORPUS: { title: string; description: string; self?: [string, string] }[] = [
  { title: "I built the ULTIMATE desk setup", description: "This video is sponsored by Squarespace. Head to squarespace.com/dave to save 10% off your first purchase.\n\nGear:\nhttps://amzn.to/abc\nhttps://www.instagram.com/dave" },
  { title: "KAKU: Ancient Seal - is it worth it?", description: "Thank you to KAKU: Ancient Seal for sponsoring this video!\nGet it on Steam: https://store.steampowered.com/app/1234\nAlso on PlayStation: https://www.playstation.com/en-us/games/kaku" },
  { title: "Best budget PC 2026", description: "Thanks to Micro Center for sending over the parts! https://www.microcenter.com/site/content/dave\nUse code DAVE10 at checkout.\nCorsair RAM: https://corsair.com/x\n#ad #pcbuild #corsair" },
  { title: "My morning routine", description: "☕ Trade Coffee: https://trade.com/dave get 30% off\nSkillshare free trial: https://skl.sh/dave\nBrought to you by Athletic Greens: drinkag1.com/dave" },
  { title: "vlog 12", description: "#tennis #pov #sponsored #WilsonPartner #teamgear\nlinktr.ee/dave" },
  { title: "Review", description: "The mattress was provided by Helix Sleep. Use code HELIX at helixsleep.com/dave.\nIn collaboration with Fellow." },
  { title: "Q&A", description: "no sponsors this time! just vibes\nhttps://www.youtube.com/@Dave2D\nfollow me on tiktok.com/@dave" },
  { title: "Big news", description: "This episode is brought to you by NordVPN. Go to nordvpn.com/dave\nAlso thanks to dbrand for the skins - https://dbrand.com/dave", self: ["Dave2D", "@Dave2D"] },
  { title: "Thanks to Dave2D for supporting", description: "Thanks to Dave2D for supporting the channel\nPresented by Bambu Lab: https://bambulab.com/x", self: ["Dave2D", "@Dave2D"] },
  { title: "Unboxing", description: "Received this camera from Sony for review. Check out the link below\nhttps://www.sony.com/electronics/x\nhttps://shrsl.com/1abc\nhttps://www.awin1.com/cread.php" },
  { title: "Empty", description: "" },
  { title: "Tags only", description: "#ad #GoveePartner #createdwithgovee #myIKEAUSA #ad" },
];

const IG_CORPUS: { caption: string; own?: string }[] = [
  { caption: "Loving my new setup #ad @fellowproducts made this so easy", own: "cafeandy_" },
  { caption: "So excited to be collaborating with soltech on the lamp of my dreams ✨ #soltechpartner", own: "andyyyen" },
  { caption: "The Opus 2 from @fellowproducts. $200 and worth every cent, link in my bio." },
  { caption: "an aura of calm this morning #ad" },
  { caption: "my new Aura frame is the best gift #ad @auraframes" },
  { caption: "#VITURE #VITUREbeast #ad @viture @nike @adidas @lululemon @gymshark" },
  { caption: "Obsessed with my Kobo Libra Colour setup #ad" },
  { caption: "Best day ever #BarbourWayOfLife #ad" },
  { caption: "something #OLG #ad and that's it" },
  { caption: "#ad @jimmyeverydayy x @someclothingbrand", own: "jimmyeverydayy" },
  { caption: "Sunday walk with the dog @mybestfriend" },
  { caption: "paid partnership with @drinkolipop 🥤 use code ANDY for 15% off #olipoppartner" },
  { caption: "Gifted by @cozyearth, the softest sheets ever #gifted #cozyearth" },
  { caption: "Thanks to @ikeausa for the desk! #myIKEAUSA #ad" },
  { caption: "Teamed up with @dolcegabbana_beauty for the launch #DGBeauty #sponsored" },
  { caption: "ambassador for @lululemon this season, use my code #lululemoncrew #teamlulu" },
  { caption: "new vid up!! link in bio. affiliate links below: https://amzn.to/x code: ANDY20" },
  { caption: "Really happy about Monet today. Monet is amazing #Ad" },
];

const norm = (rows: any[]) => rows.map((r) => `${r.brand}|${r.score ?? r.confidenceScore}|${r.label ?? r.confidenceLabel}`).sort();

describe.skipIf(!have)("parity with the original Apps Script engine", () => {
  const L = legacy();

  it("YouTube: same brands, scores, and labels", () => {
    for (const v of YT_CORPUS) {
      const selfKeys = v.self ? L.buildSelfRefKeys(v.self[0], v.self[1]) : {};
      const fullText = v.title + "\n" + v.description + "\n";
      const sig = L.scoreSignals(fullText);
      const brands = L.extractBrands(fullText, v.description);
      const seen: any = {};
      const legacyRows: any[] = [];
      for (const b of brands) {
        const n = L.normalizeBrandName(b.name);
        if (!n || n.length < 2) continue;
        const nl = n.toLowerCase();
        if (L.isJunkBrand(nl) || L.isSelfRefDynamic(nl, selfKeys) || seen[nl]) continue;
        seen[nl] = true;
        const c = sig.score + b.score;
        legacyRows.push({ brand: n, score: c, label: c >= 5 ? "High" : c >= 3 ? "Medium" : "Low" });
      }
      const port = detectYouTube({ title: v.title, description: v.description }, v.self ? buildSelfRefKeys(v.self[0], v.self[1]) : {});
      expect(norm(port), v.title).toEqual(norm(legacyRows));
    }
  });

  it("Instagram: same findings", () => {
    for (const c of IG_CORPUS) {
      const legacyRows = L.igDetect_(c.caption, c.own || "");
      const port = detectInstagram(c.caption, c.own);
      expect(norm(port), c.caption).toEqual(norm(legacyRows));
      expect(port.map((p) => p.type), c.caption).toEqual(legacyRows.map((r: any) => r.type));
    }
  });
});
