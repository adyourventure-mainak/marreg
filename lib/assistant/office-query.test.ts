import { describe, expect, it } from "vitest";
import { officeTerms, needsLocation, asksAboutOffice } from "./retrieve";
import { stripMarkdown } from "./answer";

/**
 * The bug these cover: search_offices matches p_query as a substring, but it
 * was handed the OR-joined tsquery string, so `ilike '%nearest or officer%'`
 * matched no row in a register of 587 offices and the assistant reported that
 * as "I do not have a verified office record".
 */
describe("officeTerms", () => {
  it("drops the words that describe looking, not the place", () => {
    expect(officeTerms("nearest marriage officer.")).toEqual([]);
    expect(officeTerms("find me the closest marriage registration office")).toEqual([]);
  });

  it("keeps a place name so the register can be searched on it", () => {
    expect(officeTerms("marriage officer in Barasat")).toEqual(["barasat"]);
    expect(officeTerms("Where is the marriage office in Alipurduar?")).toEqual(["alipurduar"]);
  });

  it("returns separate terms rather than one OR-joined string", () => {
    const terms = officeTerms("marriage office in Salt Lake Sector V");
    expect(terms.every((t) => !t.includes(" or "))).toBe(true);
    expect(terms.length).toBeGreaterThan(1);
  });

  it("drops Bengali tokens, which cannot match an English register", () => {
    expect(officeTerms("আমার কাছে বিবাহ নিবন্ধন অফিস কোথায়?")).toEqual([]);
  });

  it("never returns more than three terms, so one question is not many queries", () => {
    expect(officeTerms("office in alpha beta gamma delta epsilon zeta").length).toBeLessThanOrEqual(3);
  });
});

describe("needsLocation", () => {
  it("is true when the question turns on where the citizen is and they did not say", () => {
    expect(needsLocation("nearest marriage officer.")).toBe(true);
    expect(needsLocation("marriage office near me")).toBe(true);
    expect(needsLocation("আমার কাছে বিবাহ নিবন্ধন অফিস কোথায়?")).toBe(true);
  });

  it("is false once they give something to search on", () => {
    expect(needsLocation("marriage office near 700091")).toBe(false);
  });

  it("is false for a question that is not about proximity at all", () => {
    expect(needsLocation("how many witnesses are required")).toBe(false);
    expect(needsLocation("marriage officer in Barasat")).toBe(false);
  });

  it("still reads as an office question, so the directory is consulted", () => {
    expect(asksAboutOffice("nearest marriage officer.")).toBe(true);
  });
});

describe("stripMarkdown", () => {
  it("removes the emphasis a citizen was shown literally", () => {
    expect(stripMarkdown('Please use **"Find a Marriage Officer"** on this site.'))
      .toBe('Please use "Find a Marriage Officer" on this site.');
  });

  it("keeps the bracketed citations the guards depend on", () => {
    expect(stripMarkdown("The State Government may appoint **one or more** officers. [2]"))
      .toBe("The State Government may appoint one or more officers. [2]");
  });

  it("leaves plain prose untouched", () => {
    const plain = "Two witnesses must be present. [1]\n\nOnly the Marriage Officer can decide.";
    expect(stripMarkdown(plain)).toBe(plain);
  });

  it("does not eat a lone asterisk or an underscore inside a word", () => {
    expect(stripMarkdown("Rate is 5 * 3 and the column is office_name.")).toBe("Rate is 5 * 3 and the column is office_name.");
  });

  it("turns headings and bullets into plain lines", () => {
    expect(stripMarkdown("## Documents\n- passport\n- photo")).toBe("Documents\n• passport\n• photo");
  });
});
