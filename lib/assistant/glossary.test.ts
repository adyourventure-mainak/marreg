import { describe, expect, it } from "vitest";
import { BENGALI_TERMS, bridgeBengali, hasBengali } from "./glossary";
import { searchTerms } from "./retrieve";

describe("hasBengali", () => {
  it("detects Bengali script", () => {
    expect(hasBengali("বিবাহ নিবন্ধন")).toBe(true);
  });

  it("does not fire on English or on digits", () => {
    expect(hasBengali("How many witnesses are needed?")).toBe(false);
    expect(hasBengali("PIN 700001")).toBe(false);
  });
});

describe("bridgeBengali", () => {
  it("rewrites Bengali terms into the statute's own English", () => {
    expect(bridgeBengali("সাক্ষী")).toBe("witness");
    expect(bridgeBengali("আপত্তি")).toBe("objection");
  });

  it("leaves English untouched", () => {
    const q = "How many witnesses are needed?";
    expect(bridgeBengali(q)).toBe(q);
  });

  it("bridges a term carrying a Bengali case ending", () => {
    // "বিয়ের" is "বিয়ে" + a genitive ending. The stem must still be found,
    // because citizens do not type dictionary forms.
    expect(bridgeBengali("বিয়ের")).toContain("marriage");
  });

  it("maps every glossary term to plain ASCII English", () => {
    for (const [bn, en] of Object.entries(BENGALI_TERMS)) {
      expect(hasBengali(en), `${bn} maps to non-English "${en}"`).toBe(false);
      expect(en.trim()).not.toBe("");
    }
  });
});

describe("searchTerms with Bengali", () => {
  /**
   * The regression this guards: the corpus is English-only, so before the
   * bridge every one of these produced a query that matched nothing, and the
   * citizen was told the marriage Acts did not cover their question.
   */
  it.each([
    ["বিবাহ নিবন্ধনের জন্য কতজন সাক্ষী লাগে?", "witness"],
    ["নোটিশের পর আপত্তির সময়সীমা কত দিন?", "objection"],
    ["বিবাহ নিবন্ধনের জন্য কী কী নথি প্রয়োজন?", "document"],
  ])("%s yields English statutory terms", (question, expected) => {
    expect(searchTerms(question)).toContain(expected);
  });

  it("still produces English terms for an English question", () => {
    expect(searchTerms("How many witnesses are needed?")).toContain("witnesses");
  });
});
