import { describe, it, expect } from "vitest";
// the web lib is plain TS; import it relatively so the engine test runner covers it
import { cleanLine, hasProfanity } from "../../../apps/web/src/lib/clean-text";
describe("cleanLine", () => {
  it("masks swear words, keeps the first letter", () => {
    expect(cleanLine("We're fuck up the night. Black lives.")).toBe("We're f*** up the night. Black lives.");
    expect(cleanLine("This is some BULLSHIT")).toBe("This is some B*******");
  });
  it("leaves ordinary words alone", () => {
    expect(cleanLine("Here's five things I wish I knew as a first time dad")).toBe("Here's five things I wish I knew as a first time dad");
    expect(cleanLine("Assassin's Creed and the shiitake mushrooms")).toBe("Assassin's Creed and the shiitake mushrooms");
    expect(hasProfanity("Dear algorithm, please send this to students")).toBe(false);
  });
});
