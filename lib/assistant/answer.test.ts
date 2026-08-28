import { describe, expect, it } from "vitest";
import { compose, citesOnly, decidesTheCase, NO_SOURCE, NO_DECISION } from "./answer";
import { searchTerms, asksAboutOffice, districtCodeIn, pincodeIn } from "./retrieve";
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

describe("decidesTheCase", () => {
  // The exact sentences a live model produced when asked "my wife was 17,
  // is our marriage valid, will the registrar accept it".
  it("catches a prediction about what the registrar will do", () => {
    expect(decidesTheCase("The registrar may not accept the marriage for registration due to this issue.")).toBe(true);
  });

  it("catches a verdict on the reader's own marriage", () => {
    expect(decidesTheCase("Your marriage is void under this section.")).toBe(true);
    expect(decidesTheCase("Your application would be rejected.")).toBe(true);
  });

  it("catches a ruling on eligibility", () => {
    expect(decidesTheCase("Based on this, you are not eligible to register.")).toBe(true);
  });

  it("leaves an explanation of the law alone", () => {
    expect(decidesTheCase(
      "Section 5 requires that the bride has completed eighteen years of age [1]. The Marriage Officer decides whether the condition is met.",
    )).toBe(false);
  });

  it("does not fire on a plain statement about documents", () => {
    expect(decidesTheCase("Your application must include an age proof for each party [2].")).toBe(false);
  });
});

describe("compose refuses to decide", () => {
  it("replaces a decision with a referral, keeping the sections visible", async () => {
    const result = await compose("Is our marriage valid?", [passage], {
      complete: async () => "Your marriage is invalid [1]. The registrar will refuse to register it.",
    });
    expect(result.answered).toBe(false);
    expect(result.refusal).toBe(NO_DECISION);
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

const DISTRICTS = [
  { code: "WB-ALP", name: "Alipurduar", name_bn: "আলিপুরদুয়ার" },
  { code: "WB-N24", name: "North 24 Parganas", name_bn: "উত্তর ২৪ পরগনা" },
  { code: "WB-PUR", name: "Purulia", name_bn: "পুরুলিয়া" },
];

describe("districtCodeIn", () => {
  it("resolves a district the citizen named", () => {
    expect(districtCodeIn("Where is the marriage office in Alipurduar?", DISTRICTS)).toBe("WB-ALP");
  });

  it("resolves a district named in Bengali", () => {
    expect(districtCodeIn("আলিপুরদুয়ার জেলার বিবাহ দপ্তর কোথায়?", DISTRICTS)).toBe("WB-ALP");
  });

  it("prefers the longer name, so a multi-word district is not lost", () => {
    expect(districtCodeIn("an office in North 24 Parganas", DISTRICTS)).toBe("WB-N24");
  });

  it("returns null when no district is named", () => {
    expect(districtCodeIn("Where is the nearest marriage office?", DISTRICTS)).toBeNull();
  });
});

describe("pincodeIn", () => {
  it("finds a PIN code", () => {
    expect(pincodeIn("my area is 736121")).toBe("736121");
  });

  it("ignores a number that is not six digits", () => {
    expect(pincodeIn("we married in 2019")).toBeNull();
    expect(pincodeIn("reference 1234567")).toBeNull();
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
