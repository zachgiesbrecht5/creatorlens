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

import { scoreTopic, capPerChannel, channelMedians, liftTable } from "./titles";
describe("scoreTopic", () => {
  const ch = new Map([
    ["big", { id: "big", title: "Big", handle: "@big", subs: 5e6, totalViews: 2e9, videoCount: 1000, median_video: 1_000_000 }],
    ["small", { id: "small", title: "Small", handle: "@small", subs: 20e3, totalViews: 4e6, videoCount: 200 }],
  ]);
  const tv = (id: string, channelId: string, title: string, views: number, dur = 600) => ({ ...vid(id, title, views, 30, dur), channelId });
  it("ranks a small channel's breakout above a big channel's normal upload", () => {
    const items = scoreTopic([tv("1", "big", "Normal big video", 1_200_000), tv("2", "small", "I Built a PC for $300", 400_000)], ch);
    expect(items[0].id).toBe("2");
    expect(items[0].mult).toBe(20);           // 400K vs a 20K lifetime average
    expect(items[0].baseline_kind).toBe("average");
    expect(items[1].baseline_kind).toBe("median");
    expect(items[1].mult).toBe(1.2);
  });
  it("drops tiny videos and duplicates, and judges Shorts by the Shorts baseline", () => {
    const items = scoreTopic([tv("1", "small", "tiny", 500), tv("2", "small", "ok", 40_000), tv("2", "small", "ok", 40_000), tv("3", "small", "a short", 60_000, 40)], ch);
    expect(items.map((i) => i.id).sort()).toEqual(["2", "3"]);
    expect(items.find((i) => i.id === "3")!.url).toContain("/shorts/");
  });
  it("caps items per channel and builds a lift table over many channels", () => {
    const many = Array.from({ length: 6 }, (_, k) => tv(String(k), "small", k % 2 ? `How I fixed ${k}` : `plain title ${k}`, 20_000 * (k + 1)));
    const items = scoreTopic(many, ch);
    expect(capPerChannel(items, 2)).toHaveLength(2);
    expect(liftTable(items).length).toBeGreaterThan(0);
  });
  it("computes channel medians by kind, skipping climbing uploads", () => {
    const m = channelMedians([vid("a", "x", 100), vid("b", "y", 300), vid("c", "z", 9999, 2), vid("d", "s", 50, 30, 30)]);
    expect(m.median_video).toBe(200);
    expect(m.median_short).toBe(50);
  });
});
