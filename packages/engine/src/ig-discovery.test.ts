import { describe, it, expect } from "vitest";
import { captionMentions, linkedInstagram, authorFromOembed, pulseFrom } from "./instagram-client";

describe("captionMentions", () => {
  it("pulls handles, lowercases, strips trailing dots, skips emails", () => {
    expect(captionMentions("Obsessed with @Eadem.co and @sephora. Shot by @jane_doe. email me hi@gmail.com")).toEqual(["eadem.co", "sephora", "jane_doe"]);
  });
  it("dedupes", () => { expect(captionMentions("@a.b @a.b @c")).toEqual(["a.b", "c"]); });
});

describe("linkedInstagram", () => {
  it("reads instagram.com links", () => { expect(linkedInstagram("Business: x@y.com\nhttps://www.instagram.com/lizzy.hadfield/")).toBe("lizzy.hadfield"); });
  it("reads IG: @handle labels", () => { expect(linkedInstagram("IG: @noni.cyngor | TikTok: @noni")).toBe("noni.cyngor"); });
  it("ignores post links", () => { expect(linkedInstagram("watch instagram.com/p/ABC123/")).toBeNull(); });
});

describe("authorFromOembed", () => {
  it("uses author_name when Meta still sends it", () => { expect(authorFromOembed({ author_name: "Faith.Bui" })).toBe("faith.bui"); });
  it("falls back to the embed html", () => {
    const html = '<blockquote class="instagram-media"><a href="https://www.instagram.com/p/XYZ/?utm_source=ig_embed">View</a><p>A post shared by Ellen Lora (@ellenvlora)</p></blockquote>';
    expect(authorFromOembed({ html })).toBe("ellenvlora");
  });
  it("returns null when nothing names the author", () => { expect(authorFromOembed({ html: '<a href="https://www.instagram.com/p/XYZ/">x</a>' })).toBeNull(); });
});

describe("pulseFrom", () => {
  it("counts posts in the window", () => {
    const now = new Date().toISOString(); const old = new Date(Date.now() - 90 * 864e5).toISOString();
    const p = pulseFrom({ tag: "eadempartner", posts: [{ id: "1", permalink: "", timestamp: now, caption: "", mediaType: "", likes: 0, comments: 0, edge: "top" }, { id: "2", permalink: "", timestamp: old, caption: "", mediaType: "", likes: 0, comments: 0, edge: "top" }] });
    expect(p.posts).toBe(1);
  });
});
