import { describe, it, expect } from "vitest";
import { cleanPersonName, splitName, parseEmployees, parseRevenue, scoreAccount, titleRelevance, classifyEmail, companyKey, salesNavPeopleAtCompany, isGenericInbox } from "./salesnav";

describe("cleanPersonName", () => {
  it("strips credentials, pronouns, emoji and reachability noise", () => {
    expect(cleanPersonName("Jane Doe, MBA")).toBe("Jane Doe");
    expect(cleanPersonName("Adam Hadi is reachable")).toBe("Adam Hadi");
    expect(cleanPersonName("Sam Lee (she/her) 🌿")).toBe("Sam Lee");
    expect(cleanPersonName("MARIA GARCIA | Brand Partnerships")).toBe("Maria Garcia");
    expect(cleanPersonName("José O'Neil-Smith")).toBe("José O'Neil-Smith");
  });
  it("keeps initials for hidden surnames", () => {
    expect(cleanPersonName("Michael T.")).toBe("Michael T.");
  });
});

describe("splitName", () => {
  it("flags hidden surnames as partial", () => {
    expect(splitName("Michael T.")).toEqual({ first: "Michael", last: null, partial: true });
    expect(splitName("Kimia Kalbasi")).toEqual({ first: "Kimia", last: "Kalbasi", partial: false });
    expect(splitName("Cher")).toEqual({ first: "Cher", last: null, partial: true });
  });
});

describe("parseEmployees / parseRevenue", () => {
  it("reads Sales Nav headcounts", () => {
    expect(parseEmployees("1.5K+ employees on LinkedIn")).toBe(1500);
    expect(parseEmployees("126 employees")).toBe(126);
    expect(parseEmployees("11-50 employees")).toBe(50);
    expect(parseEmployees("")).toBeNull();
  });
  it("finds revenue ranges in card text", () => {
    expect(parseRevenue("Retail · $500M - $1B revenue")).toBe("$500M - $1B");
    expect(parseRevenue("no money here")).toBeNull();
  });
});

describe("scoreAccount", () => {
  it("rewards brands already paying creators and hiring", () => {
    const hot = scoreAccount({ employees_n: 800, hiring: true, signals: ["Store Expansion"], in_index_deals: 4 });
    expect(hot.score).toBe(5);
    expect(hot.why.join(" ")).toMatch(/pays creators/);
  });
  it("keeps cold accounts low", () => {
    expect(scoreAccount({ employees_n: 3, industry: "Non-profit Organization Management" }).score).toBe(1);
  });
});

describe("titleRelevance", () => {
  it("ranks creator-facing titles highest and drops ops titles", () => {
    expect(titleRelevance("Influencer Marketing Manager")).toBe(3);
    expect(titleRelevance("SVP of Marketing")).toBe(2);
    expect(titleRelevance("Founder & CEO")).toBe(1);
    expect(titleRelevance("Senior QA Engineer")).toBe(0);
    expect(titleRelevance("Talent Acquisition Partner")).toBe(0);
  });
});

describe("emails", () => {
  it("buckets Hunter results", () => {
    expect(classifyEmail({ value: "partnerships@brand.com" })).toBe("partnerships");
    expect(classifyEmail({ value: "jane@brand.com", position: "Brand Marketing Manager" })).toBe("marketing");
    expect(classifyEmail({ value: "info@brand.com" })).toBe("general");
    expect(classifyEmail({ value: "bob@brand.com", position: "Warehouse Lead" })).toBe("other");
    expect(isGenericInbox("hello@brand.com")).toBe(true);
    expect(isGenericInbox("jane.doe@brand.com")).toBe(false);
  });
});

describe("companyKey / links", () => {
  it("matches the brands.key shape", () => {
    expect(companyKey("The Home Depot, Inc.")).toBe("homedepot");
    expect(companyKey("Gear4music Ltd.")).toBe("gear4music");
  });
  it("builds a marketing people search for one company", () => {
    const u = salesNavPeopleAtCompany("10270508");
    expect(u).toContain("urn%3Ali%3Aorganization%3A10270508");
    expect(u).toContain("id%3A15");
    expect(salesNavPeopleAtCompany("1", { function: "any" })).not.toContain("FUNCTION");
  });
});
