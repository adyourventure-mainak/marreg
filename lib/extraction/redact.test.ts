import { describe, expect, it } from "vitest";
import {
  maskAllBut, redactText, lastFour, redactDeep,
  assertNoRawIdentifiers, redactForStorage,
} from "./redact";

describe("maskAllBut", () => {
  it("keeps the last four and masks the rest", () => {
    expect(maskAllBut("123456789012")).toBe("••••••••9012");
  });
  it("ignores spaces and hyphens when measuring", () => {
    expect(maskAllBut("1234 5678 9012")).toBe("••••••••9012");
    expect(maskAllBut("1234-5678-9012")).toBe("••••••••9012");
  });
  it("leaves anything already short alone", () => {
    expect(maskAllBut("9012")).toBe("9012");
    expect(maskAllBut("12")).toBe("12");
  });
});

describe("redactText", () => {
  it("masks an Aadhaar number in free text, spaced or not", () => {
    expect(redactText("Aadhaar 1234 5678 9012 issued")).toBe("Aadhaar ••••••••9012 issued");
    expect(redactText("UID:123456789012")).toBe("UID:••••••••9012");
  });

  it("masks a PAN", () => {
    expect(redactText("PAN ABCDE1234F")).toBe("PAN ••••••234F");
  });

  it("masks a voter EPIC number", () => {
    expect(redactText("EPIC WBX1234567")).toBe("EPIC ••••••4567");
  });

  it("leaves a date of birth intact", () => {
    expect(redactText("DOB 1996-04-12")).toBe("DOB 1996-04-12");
  });

  it("leaves a pincode and a house number intact", () => {
    expect(redactText("12 Rashbehari Avenue, Kolkata 700029")).toBe(
      "12 Rashbehari Avenue, Kolkata 700029",
    );
  });

  it("masks a long digit run that is not a recognised format", () => {
    expect(redactText("ref 998877665544")).toBe("ref ••••••••5544");
  });
});

describe("lastFour", () => {
  it("strips punctuation before taking the last four", () => {
    expect(lastFour("1234 5678 9012")).toBe("9012");
    expect(lastFour("ABCDE1234F")).toBe("234F");
  });
  it("returns null for nothing usable", () => {
    expect(lastFour(null)).toBeNull();
    expect(lastFour("")).toBeNull();
    expect(lastFour("---")).toBeNull();
  });
});

describe("redactDeep", () => {
  it("reduces a sensitively-named key to its last four", () => {
    expect(redactDeep({ aadhaar_number: "1234 5678 9012" })).toEqual({ aadhaar_number: "9012" });
    expect(redactDeep({ pan: "ABCDE1234F" })).toEqual({ pan: "234F" });
  });

  it("preserves date_of_birth and legibility exactly", () => {
    expect(redactDeep({ date_of_birth: "1996-04-12", legibility: 0.93 })).toEqual({
      date_of_birth: "1996-04-12",
      legibility: 0.93,
    });
  });

  it("preserves an already-safe id_number_last4", () => {
    expect(redactDeep({ id_number_last4: "9012" })).toEqual({ id_number_last4: "9012" });
  });

  it("reaches identifiers buried in nested structures", () => {
    const input = {
      person: { name: "Ananya Sen", notes: ["card 1234 5678 9012", "fine"] },
      meta: { raw_text: "UIDAI 999988887777" },
    };
    expect(redactDeep(input)).toEqual({
      person: { name: "Ananya Sen", notes: ["card ••••••••9012", "fine"] },
      meta: { raw_text: "UIDAI ••••••••7777" },
    });
  });

  it("masks a bare numeric that is long enough to be an identifier", () => {
    expect(redactDeep({ some_ref: 123456789012 })).toEqual({ some_ref: "••••••••9012" });
  });

  it("leaves small numbers and booleans alone", () => {
    expect(redactDeep({ size_bytes: 1000, ok: true })).toEqual({ size_bytes: 1000, ok: true });
  });

  it("passes through null and undefined", () => {
    expect(redactDeep(null)).toBeNull();
    expect(redactDeep({ a: null })).toEqual({ a: null });
  });
});

describe("assertNoRawIdentifiers", () => {
  it("throws when an Aadhaar-shaped value survived", () => {
    expect(() => assertNoRawIdentifiers({ x: "1234 5678 9012" })).toThrow(/Redaction failed/);
  });
  it("throws on any long digit run", () => {
    expect(() => assertNoRawIdentifiers({ x: "9998887776" })).toThrow(/Redaction failed/);
  });
  it("accepts a properly redacted payload", () => {
    expect(() => assertNoRawIdentifiers({ x: "••••••••9012", dob: "1996-04-12" })).not.toThrow();
  });
});

describe("redactForStorage", () => {
  it("redacts a realistic model response and passes the gate", () => {
    const raw = {
      document_type_guess: "AADHAAR",
      name_as_printed: "Ananya Sen",
      date_of_birth: "1996-04-12",
      address: "12 Rashbehari Avenue, Kolkata 700029",
      aadhaar_number: "1234 5678 9012",
      id_number_last4: "9012",
      legibility: 0.93,
      warnings: ["number partially obscured: 1234 5678 9012"],
    };
    const out = redactForStorage(raw) as Record<string, unknown>;

    expect(out.name_as_printed).toBe("Ananya Sen");
    expect(out.date_of_birth).toBe("1996-04-12");
    expect(out.address).toBe("12 Rashbehari Avenue, Kolkata 700029");
    expect(out.aadhaar_number).toBe("9012");
    expect(out.id_number_last4).toBe("9012");
    expect(JSON.stringify(out)).not.toContain("1234 5678 9012");
    expect(JSON.stringify(out)).not.toContain("123456789012");
  });
});
