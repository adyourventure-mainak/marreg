import { describe, expect, it } from "vitest";
import { runPreflight, isWestBengalPincode, ageOn, type PreflightInput } from "./preflight";
import type { Application, MarregDocument, Office, Party, Witness } from "./types";
import type { ActCode } from "./acts";

/* ------------------------------------------------------------------ fixtures */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));
const yearsAgo = (n: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return iso(d);
};

function party(over: Partial<Party> = {}): Party {
  return {
    id: over.id ?? "party-a",
    application_id: "app-1",
    role: "WIFE",
    name_english: "Ananya Chatterjee",
    name_bengali: null,
    date_of_birth: yearsAgo(30),
    religion: "Hindu",
    nationality: "Indian",
    marital_status_prior: "Unmarried",
    occupation: "Teacher",
    father_name: "Subrata Chatterjee",
    mother_name: "Rina Chatterjee",
    address_line1: "12 Rashbehari Avenue",
    address_line2: null,
    city: "Kolkata",
    district_code: "WB-KOL",
    pincode: "700029",
    contact_email: "ananya@example.com",
    contact_mobile: "9800000000",
    ...over,
  };
}

function witness(seq: number, over: Partial<Witness> = {}): Witness {
  return {
    id: `w-${seq}`,
    application_id: "app-1",
    sequence: seq,
    name: `Witness ${seq}`,
    address: "5 Park Street, Kolkata",
    id_type: "AADHAAR",
    id_last_four: "1234",
    mobile: "9800000001",
    ...over,
  };
}

function office(over: Partial<Office> = {}): Office {
  return {
    id: "office-1",
    office_code: "WB-KOL-01",
    name: "Marriage Officer, Kolkata South",
    officer_name: null,
    designation: null,
    district_code: "WB-KOL",
    sub_division: null,
    police_station: "Tollygunge",
    address: "Alipore, Kolkata",
    pincode: "700027",
    phone: null,
    email: null,
    acts: ["HMA_1955", "SMA_13", "SMA_16"],
    is_functional: true,
    ...over,
  };
}

function docs(types: MarregDocument["type"][], ownerIds?: (string | null)[]) {
  return types.map((type, i) => ({
    type,
    status: "PENDING" as const,
    owner_party_id: ownerIds?.[i] ?? null,
  }));
}

/** A complete, valid HMA application — the baseline every test perturbs. */
function baseline(over: Partial<PreflightInput> = {}): PreflightInput {
  const a = party({ id: "party-a", role: "WIFE" });
  const b = party({
    id: "party-b",
    role: "HUSBAND",
    name_english: "Rahul Banerjee",
    father_name: "Amit Banerjee",
  });

  const application: PreflightInput["application"] = {
    act_code: "HMA_1955" as ActCode,
    marriage_date: daysAgo(20),
    district_code: "WB-KOL",
    office_id: "office-1",
    police_station: "Tollygunge",
  } as Application;

  return {
    application,
    parties: [a, b],
    witnesses: [witness(1), witness(2), witness(3)],
    documents: docs(
      [
        "PHOTO", "PHOTO",
        "AGE_PROOF", "AGE_PROOF",
        "ADDRESS_PROOF", "ADDRESS_PROOF",
        "IDENTITY_PROOF", "IDENTITY_PROOF",
        "PRIEST_CERTIFICATE",
      ],
      ["party-a", "party-b", "party-a", "party-b", "party-a", "party-b", "party-a", "party-b", null],
    ),
    office: office(),
    ...over,
  };
}

const codes = (input: PreflightInput) => runPreflight(input).findings.map((f) => f.code);

/* --------------------------------------------------------------------- tests */

describe("baseline", () => {
  it("a complete, timely application produces no findings", () => {
    const report = runPreflight(baseline());
    expect(report.findings).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it("never throws on a completely empty draft", () => {
    const empty: PreflightInput = {
      application: {
        act_code: "HMA_1955",
        marriage_date: null,
        district_code: null,
        office_id: null,
        police_station: null,
      } as Application,
      parties: [],
      witnesses: [],
      documents: [],
      office: null,
    };
    expect(() => runPreflight(empty)).not.toThrow();
    expect(runPreflight(empty).counts.critical).toBeGreaterThan(0);
  });
});

describe("documents", () => {
  it("flags a per-party document supplied for only one party", () => {
    const input = baseline();
    input.documents = docs(
      ["PHOTO", "AGE_PROOF", "AGE_PROOF", "ADDRESS_PROOF", "ADDRESS_PROOF", "IDENTITY_PROOF", "IDENTITY_PROOF", "PRIEST_CERTIFICATE"],
      ["party-a", "party-a", "party-b", "party-a", "party-b", "party-a", "party-b", null],
    );
    expect(codes(input)).toContain("DOC_MISSING_PHOTO");
  });

  it("does not accept unattributed uploads, however many there are", () => {
    // Two photographs with no owner_party_id could both belong to one applicant.
    // submit_application matches on owner_party_id, so accepting these here
    // would mean a green preflight followed by a rejected submit.
    const input = baseline();
    input.documents = docs([
      "PHOTO", "PHOTO", "AGE_PROOF", "AGE_PROOF", "ADDRESS_PROOF", "ADDRESS_PROOF",
      "IDENTITY_PROOF", "IDENTITY_PROOF", "PRIEST_CERTIFICATE",
    ]);
    expect(codes(input)).toContain("DOC_MISSING_PHOTO");
  });

  it("requires the priest certificate under the Hindu Marriage Act", () => {
    const input = baseline();
    input.documents = input.documents.filter((d) => d.type !== "PRIEST_CERTIFICATE");
    expect(codes(input)).toContain("DOC_MISSING_PRIEST_CERTIFICATE");
  });

  it("requires an affidavit under Special Marriage Act s.13 instead", () => {
    const input = baseline({
      application: {
        act_code: "SMA_13",
        marriage_date: null,
        district_code: "WB-KOL",
        office_id: "office-1",
        police_station: null,
      } as Application,
    });
    expect(codes(input)).toContain("DOC_MISSING_AFFIDAVIT");
  });

  it("demands a divorce decree when a party is divorced", () => {
    const input = baseline();
    input.parties[0] = party({ id: "party-a", role: "WIFE", marital_status_prior: "Divorced" });
    expect(codes(input)).toContain("DOC_MISSING_DIVORCE_DECREE");
  });

  it("is satisfied once the divorce decree is uploaded", () => {
    const input = baseline();
    input.parties[0] = party({ id: "party-a", role: "WIFE", marital_status_prior: "Divorced" });
    input.documents = [...input.documents, ...docs(["DIVORCE_DECREE"])];
    expect(codes(input)).not.toContain("DOC_MISSING_DIVORCE_DECREE");
  });

  it("demands a death certificate when a party is widowed", () => {
    const input = baseline();
    input.parties[1] = party({ id: "party-b", role: "HUSBAND", marital_status_prior: "Widowed" });
    expect(codes(input)).toContain("DOC_MISSING_DEATH_CERTIFICATE_SPOUSE");
  });

  it("surfaces a document the office already rejected", () => {
    const input = baseline();
    input.documents[0] = { type: "PHOTO", status: "REJECTED", owner_party_id: "party-a" };
    expect(codes(input)).toContain("DOC_REJECTED");
  });
});

describe("guardian consent (Indian Christian Marriage Act)", () => {
  const icma = (age: number) =>
    baseline({
      application: {
        act_code: "ICMA_1872",
        marriage_date: null,
        district_code: "WB-KOL",
        office_id: "office-1",
        police_station: null,
      } as Application,
      office: office({ acts: ["ICMA_1872"] }),
      parties: [
        party({ id: "party-a", role: "BRIDE", date_of_birth: yearsAgo(age) }),
        party({ id: "party-b", role: "GROOM", date_of_birth: yearsAgo(30) }),
      ],
    });

  it("requires consent for a party aged 19", () => {
    expect(codes(icma(19))).toContain("DOC_MISSING_GUARDIAN_CONSENT");
  });

  it("does not require consent once both parties are 21", () => {
    expect(codes(icma(22))).not.toContain("DOC_MISSING_GUARDIAN_CONSENT");
  });
});

describe("timeliness", () => {
  it("flags a marriage past the six-month window as late registration", () => {
    const input = baseline({
      application: {
        act_code: "HMA_1955",
        marriage_date: daysAgo(250),
        district_code: "WB-KOL",
        office_id: "office-1",
        police_station: null,
      } as Application,
    });
    const late = runPreflight(input).findings.find((f) => f.code === "LATE_REGISTRATION");
    expect(late).toBeDefined();
    expect(late?.fix).toMatch(/affidavit/i);
  });

  it("warns when the window is nearly closed", () => {
    const input = baseline({
      application: {
        act_code: "HMA_1955",
        marriage_date: daysAgo(165),
        district_code: "WB-KOL",
        office_id: "office-1",
        police_station: null,
      } as Application,
    });
    expect(codes(input)).toContain("DEADLINE_NEAR");
  });

  it("says nothing about a marriage registered promptly", () => {
    expect(codes(baseline())).not.toContain("DEADLINE_NEAR");
  });
});

describe("office jurisdiction", () => {
  it("flags an office that does not serve the chosen Act", () => {
    const input = baseline({ office: office({ acts: ["ICMA_1872"] }) });
    expect(codes(input)).toContain("OFFICE_ACT_MISMATCH");
  });

  it("flags an office in a different district", () => {
    const input = baseline({ office: office({ district_code: "WB-HOW" }) });
    expect(codes(input)).toContain("OFFICE_DISTRICT_MISMATCH");
  });

  it("flags a non-functional office", () => {
    const input = baseline({ office: office({ is_functional: false }) });
    expect(codes(input)).toContain("OFFICE_NOT_FUNCTIONAL");
  });

  it("flags no office at all", () => {
    const input = baseline({ office: null });
    input.application.office_id = null;
    expect(codes(input)).toContain("OFFICE_MISSING");
  });
});

describe("witnesses", () => {
  it("requires exactly the number the Act sets", () => {
    expect(codes(baseline({ witnesses: [witness(1)] }))).toContain("WITNESSES_TOO_FEW");
    expect(codes(baseline({ witnesses: [witness(1), witness(2)] }))).toContain("WITNESSES_TOO_FEW");
  });

  it("flags more witnesses than the Act allows", () => {
    const input = baseline({ witnesses: [1, 2, 3, 4].map((n) => witness(n)) });
    expect(codes(input)).toContain("WITNESSES_TOO_MANY");
  });

  it("accepts exactly three", () => {
    const input = baseline({ witnesses: [witness(1), witness(2), witness(3)] });
    expect(codes(input)).not.toContain("WITNESSES_TOO_FEW");
    expect(codes(input)).not.toContain("WITNESSES_TOO_MANY");
  });

  it("flags a witness with no address", () => {
    const input = baseline({ witnesses: [witness(1, { address: null }), witness(2), witness(3)] });
    expect(codes(input)).toContain("WITNESS_INCOMPLETE");
  });

  it("notes the Parsi witness requirement", () => {
    const input = baseline({
      application: {
        act_code: "PMDA_1936",
        marriage_date: daysAgo(20),
        district_code: "WB-KOL",
        office_id: "office-1",
        police_station: null,
      } as Application,
      office: office({ acts: ["PMDA_1936"] }),
    });
    expect(codes(input)).toContain("PMDA_WITNESSES");
  });
});

describe("party details", () => {
  it("flags a pincode outside West Bengal as a note, not an error", () => {
    const input = baseline();
    input.parties[0] = party({ id: "party-a", pincode: "110001" }); // Delhi
    const f = runPreflight(input).findings.find((x) => x.code === "PINCODE_SUSPECT");
    expect(f?.severity).toBe("note");
  });

  it("treats a malformed pincode as a warning", () => {
    const input = baseline();
    input.parties[0] = party({ id: "party-a", pincode: "7002" });
    const f = runPreflight(input).findings.find((x) => x.code === "PINCODE_SUSPECT");
    expect(f?.severity).toBe("warning");
  });

  it("flags an application with no way to reach either applicant", () => {
    const input = baseline();
    input.parties = input.parties.map((p) => ({ ...p, contact_mobile: null, contact_email: null }));
    expect(codes(input)).toContain("NO_CONTACT");
  });

  it("flags a missing address", () => {
    const input = baseline();
    input.parties[0] = party({ id: "party-a", address_line1: null });
    expect(codes(input)).toContain("PARTY_ADDRESS_MISSING");
  });
});

describe("eligibility", () => {
  it("flags an underage party", () => {
    const input = baseline();
    input.parties[0] = party({ id: "party-a", date_of_birth: yearsAgo(16) });
    expect(codes(input)).toContain("ELIGIBILITY");
  });

  it("flags a future marriage date under an already-solemnised Act", () => {
    const input = baseline();
    input.application.marriage_date = iso(new Date(Date.now() + 30 * 86_400_000));
    expect(codes(input)).toContain("ELIGIBILITY");
  });
});

describe("report shape", () => {
  it("sorts critical findings ahead of warnings and notes", () => {
    const input = baseline({ office: null, witnesses: [] });
    input.application.office_id = null;
    input.parties[0] = party({ id: "party-a", pincode: "110001", contact_mobile: null, contact_email: null });
    const severities = runPreflight(input).findings.map((f) => f.severity);
    const rank = { critical: 0, warning: 1, note: 2 } as const;
    const ranks = severities.map((s) => rank[s]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("counts by severity", () => {
    const report = runPreflight(baseline({ witnesses: [] }));
    const summed = report.counts.critical + report.counts.warning + report.counts.note;
    expect(summed).toBe(report.findings.length);
  });
});

describe("helpers", () => {
  it("accepts West Bengal pincodes and rejects Sikkim's", () => {
    expect(isWestBengalPincode("700029")).toBe(true);
    expect(isWestBengalPincode("743301")).toBe(true);
    expect(isWestBengalPincode("737101")).toBe(false); // Sikkim
    expect(isWestBengalPincode("110001")).toBe(false); // Delhi
    expect(isWestBengalPincode("70002")).toBe(false);
  });

  it("computes age on a date, not just today", () => {
    expect(ageOn("2000-06-15", new Date(Date.UTC(2020, 5, 14)))).toBe(19);
    expect(ageOn("2000-06-15", new Date(Date.UTC(2020, 5, 15)))).toBe(20);
  });
});
