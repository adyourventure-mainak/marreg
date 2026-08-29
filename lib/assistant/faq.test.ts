import { describe, expect, it } from "vitest";
import { FAQ, matchFaq, normalise } from "./faq";

describe("normalise", () => {
  it("bridges Bengali into English before matching", () => {
    expect(normalise("কতজন সাক্ষী")).toContain("witness");
    expect(normalise("কতজন সাক্ষী")).toContain("how many");
  });
});

describe("matchFaq", () => {
  /**
   * The pairs that matter: a Bengali question and its English twin must reach
   * the same entry, or the bilingual service gives two different answers to
   * one question.
   */
  it.each([
    ["How many witnesses are needed?", "বিবাহ নিবন্ধনের জন্য কতজন সাক্ষী লাগে?"],
    ["How long is the objection period after the notice?", "নোটিশের পর আপত্তির সময়সীমা কত দিন?"],
    ["How do I get a marriage certificate?", "বিবাহের শংসাপত্র কীভাবে পাব?"],
  ])("routes %s and its Bengali twin to the same entry", (en, bn) => {
    const a = matchFaq(en);
    const b = matchFaq(bn);
    expect(a).not.toBeNull();
    expect(b?.id).toBe(a?.id);
  });

  it("requires every condition row, not just one", () => {
    // A witness word with no quantity word is a different question.
    expect(matchFaq("who may act as a witness")?.id).not.toBe("witnesses");
  });

  it("returns null for a question the corpus was never meant to cover", () => {
    expect(matchFaq("Something totally unrelated about aircraft leasing")).toBeNull();
  });

  it("respects an Act scope the citizen has chosen", () => {
    // The Hindu-conditions entry must not be served to someone filtered to SMA.
    expect(matchFaq("what are the conditions for a hindu marriage", "SMA_13")?.id)
      .not.toBe("conditions-hindu");
  });

  it("prefers the Act-scoped entry when both could match", () => {
    expect(matchFaq("what are the conditions for a hindu marriage")?.id).toBe("conditions-hindu");
  });
});

describe("FAQ table", () => {
  it("has unique ids", () => {
    expect(new Set(FAQ.map((e) => e.id)).size).toBe(FAQ.length);
  });

  /**
   * An entry asserts nothing about the law — it only names sections. This is
   * what keeps the file free of claims a reviewer would have to fact-check.
   */
  it("names sections and never carries answer text", () => {
    for (const entry of FAQ) {
      expect(entry.sections.length).toBeGreaterThan(0);
      for (const s of entry.sections) expect(s).toMatch(/^Section /);
      expect(entry.match.length).toBeGreaterThan(0);
      for (const row of entry.match) expect(row.length).toBeGreaterThan(0);
    }
  });
});
