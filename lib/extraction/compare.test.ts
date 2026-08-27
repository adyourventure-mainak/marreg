import { describe, expect, it } from "vitest";
import {
  compareDates, compareNames, compareToParty, isPlaceholderDob, nameTokens,
} from "./compare";
import type { Extracted } from "./types";
import type { Party } from "../types";

const party = (over: Partial<Party> = {}): Party => ({
  id: "p1",
  application_id: "a1",
  role: "BRIDE",
  name_english: "Aparna Sen Roy",
  name_bengali: null,
  date_of_birth: "1996-04-11",
  religion: null, nationality: null, marital_status_prior: null, occupation: null,
  father_name: null, mother_name: null,
  address_line1: null, address_line2: null, city: null,
  district_code: null, pincode: null, contact_email: null, contact_mobile: null,
  ...over,
});

const extracted = (over: Partial<Extracted> = {}): Extracted => ({
  document_type_guess: "aadhaar",
  name_as_printed: "Aparna Sen Roy",
  date_of_birth: "1996-04-11",
  address: null,
  id_number_last4: "4821",
  issuing_authority: "UIDAI",
  legibility: 0.9,
  warnings: [],
  ...over,
});

describe("nameTokens", () => {
  it("lowercases and strips punctuation", () => {
    expect(nameTokens("A. K. Bose-Mullick")).toEqual(["a", "k", "bose", "mullick"]);
  });

  it("drops honorifics so they cannot cause a false mismatch", () => {
    expect(nameTokens("Smt. Aparna Sen")).toEqual(["aparna", "sen"]);
    expect(nameTokens("Md Rafiqul Islam")).toEqual(["rafiqul", "islam"]);
  });

  it("strips diacritics", () => {
    expect(nameTokens("Renée Dé")).toEqual(["renee", "de"]);
  });

  it("returns nothing for a name that is only an honorific", () => {
    expect(nameTokens("Dr.")).toEqual([]);
  });
});

describe("compareNames", () => {
  it("matches identical names", () => {
    expect(compareNames("Aparna Sen Roy", "Aparna Sen Roy")).toBe("match");
  });

  it("matches regardless of word order", () => {
    expect(compareNames("Sen Roy Aparna", "Aparna Sen Roy")).toBe("match");
  });

  it("matches across case, punctuation and honorifics", () => {
    expect(compareNames("SMT. APARNA SEN ROY", "Aparna Sen Roy")).toBe("match");
  });

  it("treats an initial as partial, not a mismatch", () => {
    expect(compareNames("A Sen Roy", "Aparna Sen Roy")).toBe("partial");
  });

  it("treats a missing surname as partial", () => {
    expect(compareNames("Aparna Sen", "Aparna Sen Roy")).toBe("partial");
  });

  it("flags genuinely different names", () => {
    expect(compareNames("Rakesh Gupta", "Aparna Sen Roy")).toBe("differs");
  });

  it("flags a name sharing only one part as differing", () => {
    expect(compareNames("Rakesh Gupta Roy", "Aparna Sen Roy")).toBe("differs");
  });

  it("treats a Bengali transliteration variant as partial, not a mismatch", () => {
    expect(compareNames("Sujata Chatterjee", "Sujata Chattopadhyay")).toBe("partial");
    expect(compareNames("Anil Banerjee", "Anil Bandyopadhyay")).toBe("partial");
    expect(compareNames("Ratan Mukherjee", "Ratan Mukhopadhyay")).toBe("partial");
  });

  it("does not let the prefix rule collapse two unrelated surnames", () => {
    expect(compareNames("Sujata Chatterjee", "Sujata Bhattacharya")).toBe("differs");
  });

  it("returns unknown when either side has no comparable tokens", () => {
    expect(compareNames("", "Aparna Sen Roy")).toBe("unknown");
    expect(compareNames("Dr.", "Aparna Sen Roy")).toBe("unknown");
  });
});

describe("compareDates", () => {
  it("matches an identical ISO date", () => {
    expect(compareDates("1996-04-11", "1996-04-11")).toBe("match");
  });

  it("reports a same-year difference as partial", () => {
    expect(compareDates("1996-01-01", "1996-04-11")).toBe("partial");
  });

  it("reports a different year as differing", () => {
    expect(compareDates("1994-04-11", "1996-04-11")).toBe("differs");
  });

  it("returns unknown for anything that is not a plain ISO date", () => {
    expect(compareDates("11/04/1996", "1996-04-11")).toBe("unknown");
    expect(compareDates("1996", "1996-04-11")).toBe("unknown");
  });
});

describe("isPlaceholderDob", () => {
  it("recognises the 1 January placeholder", () => {
    expect(isPlaceholderDob("1996-01-01")).toBe(true);
  });

  it("does not flag a real 1 January date as anything else", () => {
    expect(isPlaceholderDob("1996-04-11")).toBe(false);
    expect(isPlaceholderDob("not a date")).toBe(false);
  });
});

describe("compareToParty", () => {
  it("returns nothing when the document is not attributed to a party", () => {
    expect(compareToParty(extracted(), null)).toEqual([]);
  });

  it("returns nothing when everything agrees", () => {
    expect(compareToParty(extracted(), party())).toEqual([]);
  });

  it("reports a differing name at high severity", () => {
    const [d] = compareToParty(extracted({ name_as_printed: "Rakesh Gupta" }), party());
    expect(d.code).toBe("NAME_DIFFERS");
    expect(d.severity).toBe("high");
    expect(d.onDocument).toBe("Rakesh Gupta");
    expect(d.onApplication).toBe("Aparna Sen Roy");
  });

  it("reports an initial as low severity", () => {
    const [d] = compareToParty(extracted({ name_as_printed: "A Sen Roy" }), party());
    expect(d.code).toBe("NAME_PARTIAL");
    expect(d.severity).toBe("low");
  });

  it("explains the 1 January placeholder rather than calling it a mismatch", () => {
    const [d] = compareToParty(extracted({ date_of_birth: "1996-01-01" }), party());
    expect(d.code).toBe("DOB_YEAR_ONLY");
    expect(d.severity).toBe("low");
    expect(d.message).toContain("1 January");
  });

  it("reports a different birth year at high severity", () => {
    const [d] = compareToParty(extracted({ date_of_birth: "1994-04-11" }), party());
    expect(d.code).toBe("DOB_DIFFERS");
    expect(d.severity).toBe("high");
  });

  it("reports both a name and a date discrepancy together", () => {
    const found = compareToParty(
      extracted({ name_as_printed: "Rakesh Gupta", date_of_birth: "1994-04-11" }),
      party(),
    );
    expect(found.map((d) => d.code)).toEqual(["NAME_DIFFERS", "DOB_DIFFERS"]);
  });

  it("skips a field the model could not read", () => {
    expect(compareToParty(extracted({ name_as_printed: null, date_of_birth: null }), party()))
      .toEqual([]);
  });
});
