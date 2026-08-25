export const ACT_CODES = ["HMA_1955", "SMA_13", "SMA_16", "ICMA_1872", "PMDA_1936"] as const;
export type ActCode = (typeof ACT_CODES)[number];

export type ActRule = {
  code: ActCode;
  label: string;
  shortLabel: string;
  /** true = the marriage has already taken place; false = notice is given first */
  alreadySolemnised: boolean;
  objectionDays: number;
  noticeDays?: number;
  deadlineMonths: number;
  /** minimum days that must pass after the marriage before applying */
  minimumDaysAfterMarriage?: number;
  summary: string;
  documents: string[];
};

export const ACTS: Record<ActCode, ActRule> = {
  HMA_1955: {
    code: "HMA_1955",
    label: "The Hindu Marriage Act, 1955",
    shortLabel: "Hindu Marriage Act",
    alreadySolemnised: true,
    objectionDays: 7,
    deadlineMonths: 6,
    summary:
      "For a marriage already solemnised under Hindu rites. Apply after the ceremony. Objections may be filed for 7 days from the date the application is received; registration is completed within 6 calendar months.",
    documents: ["Photograph of each party", "Age proof", "Address proof", "Identity proof", "Priest / ceremony certificate"],
  },
  SMA_13: {
    code: "SMA_13",
    label: "The Special Marriage Act, 1954 — Section 13",
    shortLabel: "Special Marriage Act s.13",
    alreadySolemnised: false,
    objectionDays: 30,
    noticeDays: 30,
    deadlineMonths: 3,
    summary:
      "For a marriage to be solemnised before the Marriage Officer. A notice of intended marriage is published for 30 days; the marriage is then solemnised and registered within 3 months of the notice period ending.",
    documents: ["Photograph of each party", "Age proof", "Address proof", "Identity proof", "Affidavit of marital status"],
  },
  SMA_16: {
    code: "SMA_16",
    label: "The Special Marriage Act, 1954 — Section 16",
    shortLabel: "Special Marriage Act s.16",
    alreadySolemnised: true,
    objectionDays: 30,
    deadlineMonths: 6,
    minimumDaysAfterMarriage: 30,
    summary:
      "For registering a marriage already solemnised in another form. The application may be made no earlier than 30 days after the marriage. Objections may be filed for 30 days; registration is completed within 6 calendar months.",
    documents: ["Photograph of each party", "Age proof", "Address proof", "Identity proof", "Proof of the earlier ceremony"],
  },
  ICMA_1872: {
    code: "ICMA_1872",
    label: "The Indian Christian Marriage Act, 1872",
    shortLabel: "Indian Christian Marriage Act",
    alreadySolemnised: false,
    objectionDays: 30,
    noticeDays: 30,
    deadlineMonths: 6,
    summary:
      "For Christian marriages solemnised by a licensed minister or Marriage Registrar. Both parties must be 21 or older; where a party is between 18 and 21, guardian consent is required.",
    documents: ["Photograph of each party", "Age proof", "Address proof", "Identity proof", "Guardian consent (if 18–21)"],
  },
  PMDA_1936: {
    code: "PMDA_1936",
    label: "The Parsi Marriage and Divorce Act, 1936",
    shortLabel: "Parsi Marriage & Divorce Act",
    alreadySolemnised: true,
    objectionDays: 30,
    deadlineMonths: 6,
    summary:
      "For Parsi marriages solemnised by a priest in the presence of two Parsi witnesses. The certificate signed by the priest is registered with the Registrar.",
    documents: ["Photograph of each party", "Age proof", "Address proof", "Identity proof", "Priest's certificate"],
  },
};

export const ACT_LIST = ACT_CODES.map((code) => ACTS[code]);

export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export function addCalendarMonths(date: Date, months: number): Date {
  const out = new Date(date);
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

/** Party roles that apply under a given act, in display order. */
export function partyRoles(act: ActCode): ["BRIDE" | "WIFE", "GROOM" | "HUSBAND"] {
  return ACTS[act].alreadySolemnised ? ["WIFE", "HUSBAND"] : ["BRIDE", "GROOM"];
}

/** Validation that mirrors the checks the registrar will make. */
export function validateEligibility(input: {
  act: ActCode;
  marriageDate?: string | null;
  dobA?: string | null;
  dobB?: string | null;
}): string[] {
  const errors: string[] = [];
  const rule = ACTS[input.act];
  const today = new Date();

  const ageOn = (dob: string, on: Date) => {
    const d = new Date(dob);
    let age = on.getUTCFullYear() - d.getUTCFullYear();
    const m = on.getUTCMonth() - d.getUTCMonth();
    if (m < 0 || (m === 0 && on.getUTCDate() < d.getUTCDate())) age -= 1;
    return age;
  };

  const reference = input.marriageDate ? new Date(input.marriageDate) : today;
  const minAge = input.act === "ICMA_1872" ? 21 : 18;

  for (const [label, dob] of [["Applicant 1", input.dobA], ["Applicant 2", input.dobB]] as const) {
    if (!dob) continue;
    const age = ageOn(dob, reference);
    if (age < 18) errors.push(`${label} must be at least 18 years old on the date of marriage.`);
    else if (age < minAge) errors.push(`${label} is under ${minAge}; guardian consent is required under this Act.`);
  }

  if (rule.alreadySolemnised) {
    if (!input.marriageDate) {
      errors.push("Enter the date the marriage took place.");
    } else {
      const marriage = new Date(input.marriageDate);
      if (marriage > today) errors.push("Under this Act the marriage must already have taken place.");
      if (rule.minimumDaysAfterMarriage) {
        const earliest = addDays(marriage, rule.minimumDaysAfterMarriage);
        if (earliest > today) {
          errors.push(
            `Under this Act you may apply from ${earliest.toISOString().slice(0, 10)} — ${rule.minimumDaysAfterMarriage} days after the marriage.`,
          );
        }
      }
    }
  } else if (input.marriageDate && new Date(input.marriageDate) < today) {
    errors.push("This Act is for a marriage yet to be solemnised. Choose an Act for an already-solemnised marriage.");
  }

  return errors;
}
