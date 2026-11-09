import { describe, it, expect } from "vitest";
import { analyzeTitles, tagTitle, splitTitles } from "./titles";

const d = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString();
const vid = (id: string, title: string, views: number, daysAgo = 60, dur = 600) => ({ id, title, views, publishedAt: d(daysAgo), durationSeconds: dur });

describe("tagTitle", () => {
  it("names the patterns a manager can quote back", () => {
    expect(tagTitle("I Tried the $20 Espresso Machine for 30 Days")).toEqual(expect.arrayContaining(["number", "first_person", "money", "time", "named"]));
    expect(tagTitle("Why Your PC Build Is WRONG")).toEqual(expect.arrayContaining(["question", "how_why", "you", "caps", "negative"]));
    expect(tagTitle("Morning routine")).not.toContain("caps");
    expect(tagTitle("Best 4K TV for PS5 (2026)")).toContain("brackets");
    expect(tagTitle("Best 4K TV for PS5 (2026)")).not.toContain("caps");
  });
});

describe("analyzeTitles", () => {
  const videos = [
    vid("a", "I Spent $500 on Coffee Gear", 1000),
    vid("b", "I Tested 7 Grinders", 900),
    vid("c", "I Broke My Espresso Machine", 800),
    vid("d", "Latte art practice", 100),
    vid("e", "Cafe vlog", 120),
    vid("f", "New kettle unboxing", 90),
    vid("g", "Fresh upload (climbing)", 5, 2),
    vid("s1", "Quick tip", 50000, 40, 30),
    vid("s2", "Another tip", 10000, 40, 30),
    vid("s3", "Third tip", 20000, 40, 30),
  ];
  const a = analyzeTitles(videos);
  it("judges Shorts against their own median and excludes climbing videos from the median", () => {
    expect(a.median_video).toBe(460); // 90,100,120,800,900,1000 -> (120+800)/2
    expect(a.median_short).toBe(20000);
    const climbing = a.items.find((i) => i.id === "g")!;
    expect(climbing.climbing).toBe(true);
    expect(a.items.find((i) => i.id === "s1")!.mult).toBe(2.5);
  });
  it("computes lift for patterns with 3+ titles on each side", () => {
    const fp = a.patterns.find((p) => p.key === "first_person")!;
    expect(fp.with_n).toBe(3); expect(fp.without_n).toBe(6);
    expect(fp.lift).toBeGreaterThan(1);
    const emoji = a.patterns.find((p) => p.key === "emoji");
    expect(emoji).toBeUndefined(); // no titles carry it, so it is dropped
  });
  it("splits top and bottom fifths", () => {
    const s = splitTitles(a.items);
    expect(s.top[0].id).toBe("s1");
    expect(s.bottom[0].mult).toBeLessThanOrEqual(s.top[s.top.length - 1].mult!);
  });
});
