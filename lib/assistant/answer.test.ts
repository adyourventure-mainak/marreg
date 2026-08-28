import { describe, expect, it } from "vitest";
import { compose, citesOnly, NO_SOURCE } from "./answer";
import { searchTerms, asksAboutOffice } from "./retrieve";
import type { Passage } from "./types";

const passage: Passage = {
  index: 1,
  kind: "ACT",
  citation: "The Hindu Marriage Act, 1955",
  heading: "Section 8. Registration of Hindu marriages",
  body: "The State Government may make rules providing that the parties to any such marriage may have the particulars relating to their marriage entered in such manner as may be prescribed.",
  page: 7,
};

const never: Parameters<typeof compose>[2] = {
  complete: async () => {
    throw new Error("the model must not be called");
  },
};

describe("compose", () => {
  it("refuses without calling the model when nothing was retrieved", async () => {
    const result = await compose("What is the fee in Dhaka?", [], never);
    expect(result.answered).toBe(false);
    expect(result.refusal).toBe(NO_SOURCE);
  });

  it("refuses an answer that cites a passage it was never given", async () => {
    const result = await compose("How do I register?", [passage], {
      complete: async () => "You must apply within thirty days [4].",
    });
    expect(result.answered).toBe(false);
    expect(result.text).toBe("");
  });

  it("refuses an empty reply rather than showing a blank answer", async () => {
    const result = await compose("How do I register?", [passage], {
      complete: async () => "   ",
    });
    expect(result.answered).toBe(false);
  });

  it("returns a grounded answer with the passages attached", async () => {
    const result = await compose("How do I register?", [passage], {
      complete: async () => "The State Government makes the rules for entering the particulars [1].",
    });
    expect(result.answered).toBe(true);
    expect(result.passages).toHaveLength(1);
  });
});

describe("citesOnly", () => {
  it("accepts prose with no citations at all", () => {
    // A refusal written by the model cites nothing, and that is not an invention.
    expect(citesOnly("The passages do not cover this.", [passage])).toBe(true);
  });

  it("rejects a citation outside the supplied range", () => {
    expect(citesOnly("See [1] and [2].", [passage])).toBe(false);
  });
});

describe("searchTerms", () => {
  it("drops filler and corpus-wide words so the query discriminates", () => {
    const terms = searchTerms("What documents do I need to register my marriage in West Bengal?");
    expect(terms).toContain("documents");
    expect(terms).toContain("register");
    expect(terms).not.toContain("marriage");
    expect(terms).not.toContain("bengal");
  });

  it("returns nothing for a question with no searchable words", () => {
    expect(searchTerms("what is it?")).toBe("");
  });

  it("ORs the terms, because a citizen does not phrase things like a draftsman", () => {
    expect(searchTerms("witness photograph")).toBe("witness or photograph");
  });
});

describe("asksAboutOffice", () => {
  it("recognises a directory question", () => {
    expect(asksAboutOffice("Where is the nearest marriage office?")).toBe(true);
  });

  it("does not pull office records into a pure question of law", () => {
    expect(asksAboutOffice("How many witnesses are required?")).toBe(false);
  });
});
