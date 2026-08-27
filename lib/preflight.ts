/**
 * Layer 1 — deterministic pre-flight checks.
 *
 * Every rule here mirrors a check the Marriage Officer will make at scrutiny.
 * Catching them before submission is what stops a deficiency notice three
 * weeks later.
 *
 * Design rules:
 *   - Pure functions. No network, no model, no framework imports.
 *   - Advisory only. Nothing here blocks submission — a false positive that
 *     traps a couple out of their own application is worse than the
 *     deficiency notice it was meant to prevent.
 *   - Deterministic. If a rule cannot be decided from the data, it stays
 *     silent rather than guessing.
 */

import { ACTS, partyRoles, validateEligibility, addCalendarMonths, type ActCode } from "./acts";
import type { Application, MarregDocument, Office, Party, Witness, DocumentType } from "./types";
import { DOCUMENT_LABELS } from "./types";

export type Severity = "critical" | "warning" | "note";

export type Finding = {
  /** Stable identifier — safe to log to audit_events and to test against. */
  code: string;
  severity: Severity;
  /** What is wrong, in the applicant's words. */
  message: string;
  /** What to do about it. */
  fix?: string;
  /** Wizard step that fixes it, for deep-linking. */
  step?: 1 | 2 | 3 | 4 | 5;
};

export type PreflightReport = {
  findings: Finding[];
  counts: Record<Severity, number>;
  /** True when nothing at all was found. */
  clean: boolean;
};

/** The subset of a document row the rules actually read. */
export type PreflightDocument = Pick<MarregDocument, "type" | "status"> & {
  owner_party_id?: string | null;
};

export type PreflightInput = {
  application: Pick<
    Application,
    "act_code" | "marriage_date" | "district_code" | "office_id" | "police_station"
  >;
  parties: Party[];
  witnesses: Witness[];
  documents: PreflightDocument[];
  office: Office | null;
};

/* ------------------------------------------------------------------ helpers */

const MS_PER_DAY = 86_400_000;

/** Age in whole years on a given date. */
export function ageOn(dob: string, on: Date): number {
  const d = new Date(dob);
  let age = on.getUTCFullYear() - d.getUTCFullYear();
  const m = on.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

/**
 * Structural pincode check for West Bengal.
 *
 * WB postal codes run 700xxx–743xxx, with 737xxx belonging to Sikkim. This is
 * a range check, not a district lookup — replace it with a real pincode →
 * district map once the official office directory is imported
 * (scripts/import-offices.ts).
 */
export function isWestBengalPincode(pincode: string): boolean {
  if (!/^\d{6}$/.test(pincode)) return false;
  const n = Number(pincode);
  if (n >= 737000 && n <= 737999) return false; // Sikkim
  return n >= 700000 && n <= 743999;
}

/** Documents every party must supply, under every Act. */
export const PER_PARTY_DOCUMENTS: DocumentType[] = [
  "PHOTO",
  "AGE_PROOF",
  "ADDRESS_PROOF",
  "IDENTITY_PROOF",
];

/** One-per-application document required by each Act, where there is one. */
export const ACT_DOCUMENT: Partial<Record<ActCode, DocumentType>> = {
  HMA_1955: "PRIEST_CERTIFICATE",
  SMA_13: "AFFIDAVIT",
  SMA_16: "PRIEST_CERTIFICATE",
  PMDA_1936: "PRIEST_CERTIFICATE",
};

/**
 * Is a document type covered for every party?
 *
 * Every party must have a document of this type attributed to them by
 * owner_party_id — the same test submit_application applies.
 */
function coveredForAllParties(
  documents: PreflightDocument[],
  type: DocumentType,
  parties: Party[],
): boolean {
  const ofType = documents.filter((d) => d.type === type);
  if (ofType.length === 0) return false;

  const attributed = new Set(
    ofType.map((d) => d.owner_party_id).filter((id): id is string => Boolean(id)),
  );
  // Attribution is required, not merely preferred: submit_application matches
  // documents to parties by owner_party_id, so counting unattributed uploads
  // here would pass preflight and then fail at submit.
  return parties.length > 0 && parties.every((p) => attributed.has(p.id));
}

function partyLabel(p: Party): string {
  return p.name_english?.trim() || p.role.toLowerCase();
}

/* ------------------------------------------------------------------- rules */

function checkEligibility(input: PreflightInput, out: Finding[]): void {
  const { application, parties } = input;
  const roles = partyRoles(application.act_code);
  const a = parties.find((p) => p.role === roles[0]);
  const b = parties.find((p) => p.role === roles[1]);

  if (parties.length < 2) {
    out.push({
      code: "PARTIES_INCOMPLETE",
      severity: "critical",
      message: "Both applicants must be entered before this application can be scrutinised.",
      fix: "Complete the applicant details.",
      step: 1,
    });
  }

  for (const err of validateEligibility({
    act: application.act_code,
    marriageDate: application.marriage_date,
    dobA: a?.date_of_birth,
    dobB: b?.date_of_birth,
  })) {
    out.push({
      code: "ELIGIBILITY",
      severity: "critical",
      message: err,
      step: err.toLowerCase().includes("marriage") ? 2 : 1,
    });
  }
}

function checkTimeliness(input: PreflightInput, out: Finding[]): void {
  const { application } = input;
  const rule = ACTS[application.act_code];
  if (!rule.alreadySolemnised || !application.marriage_date) return;

  const marriage = new Date(application.marriage_date);
  if (Number.isNaN(marriage.getTime())) return;

  const deadline = addCalendarMonths(marriage, rule.deadlineMonths);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / MS_PER_DAY);

  if (daysLeft < 0) {
    out.push({
      code: "LATE_REGISTRATION",
      severity: "critical",
      message: `This marriage took place more than ${rule.deadlineMonths} months ago, so the ordinary registration window under ${rule.shortLabel} has closed.`,
      fix: "Late registration is usually still possible, but the office will want a notarised affidavit explaining the delay, and a late fee may apply. Upload the affidavit with your documents.",
      step: 4,
    });
  } else if (daysLeft <= 30) {
    out.push({
      code: "DEADLINE_NEAR",
      severity: "warning",
      message: `Only ${daysLeft} day${daysLeft === 1 ? "" : "s"} remain in the ${rule.deadlineMonths}-month registration window for this marriage.`,
      fix: "Submit as soon as the documents are ready — scrutiny alone can take up to three weeks.",
      step: 5,
    });
  }
}

function checkOffice(input: PreflightInput, out: Finding[]): void {
  const { application, office } = input;
  const rule = ACTS[application.act_code];

  if (!application.office_id || !office) {
    out.push({
      code: "OFFICE_MISSING",
      severity: "critical",
      message: "No Marriage Officer has been chosen.",
      fix: "Choose the office for the district where either applicant lives.",
      step: 2,
    });
    return;
  }

  if (!office.acts.includes(application.act_code)) {
    out.push({
      code: "OFFICE_ACT_MISMATCH",
      severity: "critical",
      message: `${office.name} does not register marriages under the ${rule.shortLabel}.`,
      fix: "Choose an office that serves this Act, or change the Act.",
      step: 2,
    });
  }

  if (!office.is_functional) {
    out.push({
      code: "OFFICE_NOT_FUNCTIONAL",
      severity: "warning",
      message: `${office.name} is marked as not currently functioning.`,
      fix: "Choose another office in the same district.",
      step: 2,
    });
  }

  if (
    application.district_code &&
    office.district_code &&
    application.district_code !== office.district_code
  ) {
    out.push({
      code: "OFFICE_DISTRICT_MISMATCH",
      severity: "warning",
      message: "The chosen office is in a different district from the one recorded for this marriage.",
      fix: "Offices only have jurisdiction in their own district. Check the district and the office agree.",
      step: 2,
    });
  }
}

function checkParties(input: PreflightInput, out: Finding[]): void {
  const { parties } = input;

  for (const p of parties) {
    const who = partyLabel(p);

    if (!p.address_line1?.trim()) {
      out.push({
        code: "PARTY_ADDRESS_MISSING",
        severity: "warning",
        message: `No address recorded for ${who}.`,
        fix: "The address must match the address proof you upload.",
        step: 1,
      });
    }

    if (p.pincode && !isWestBengalPincode(p.pincode)) {
      out.push({
        code: "PINCODE_SUSPECT",
        severity: /^\d{6}$/.test(p.pincode) ? "note" : "warning",
        message: /^\d{6}$/.test(p.pincode)
          ? `The pincode for ${who} (${p.pincode}) is outside West Bengal.`
          : `The pincode for ${who} (${p.pincode}) is not a six-digit code.`,
        fix: "Registration is normally done where one of the applicants resides. Check the pincode, or choose an office in the district where you actually live.",
        step: 1,
      });
    }

    if (!p.father_name?.trim() && !p.mother_name?.trim()) {
      out.push({
        code: "PARENT_NAMES_MISSING",
        severity: "note",
        message: `No parent's name recorded for ${who}.`,
        fix: "Most offices expect at least the father's name on the register.",
        step: 1,
      });
    }
  }

  const reachable = parties.some((p) => p.contact_mobile?.trim() || p.contact_email?.trim());
  if (parties.length > 0 && !reachable) {
    out.push({
      code: "NO_CONTACT",
      severity: "warning",
      message: "Neither applicant has a mobile number or email address.",
      fix: "The office uses these to tell you about corrections and your appointment. Without one you will only find out by checking the site.",
      step: 1,
    });
  }
}

function checkWitnesses(input: PreflightInput, out: Finding[]): void {
  const { witnesses, application } = input;
  const required = ACTS[application.act_code].requiredWitnesses;

  if (witnesses.length !== required) {
    out.push({
      code: witnesses.length < required ? "WITNESSES_TOO_FEW" : "WITNESSES_TOO_MANY",
      severity: "critical",
      message:
        witnesses.length < required
          ? `${required} witnesses are required; ${witnesses.length === 0 ? "none have" : `only ${witnesses.length} have`} been added.`
          : `${required} witnesses are required; ${witnesses.length} have been added.`,
      fix: `Record exactly ${required} witnesses, each able to attend on the day with their own photo ID.`,
      step: 3,
    });
  }

  if (application.act_code === "PMDA_1936" && witnesses.length > 0) {
    out.push({
      code: "PMDA_WITNESSES",
      severity: "note",
      message: "Under the Parsi Marriage and Divorce Act the witnesses to the ceremony must themselves be Parsi.",
      step: 3,
    });
  }

  for (const w of witnesses) {
    const missing: string[] = [];
    if (!w.address?.trim()) missing.push("address");
    if (!w.id_type?.trim()) missing.push("ID type");
    if (!w.id_last_four?.trim()) missing.push("ID number");
    if (missing.length > 0) {
      out.push({
        code: "WITNESS_INCOMPLETE",
        severity: "warning",
        message: `Witness ${w.name || w.sequence} has no ${missing.join(" or ")} recorded.`,
        fix: "Witnesses without valid address proof are a common reason for a deficiency notice.",
        step: 3,
      });
    }
  }
}

function checkDocuments(input: PreflightInput, out: Finding[]): void {
  const { application, parties, documents } = input;
  const rule = ACTS[application.act_code];

  for (const type of PER_PARTY_DOCUMENTS) {
    if (!coveredForAllParties(documents, type, parties)) {
      out.push({
        code: `DOC_MISSING_${type}`,
        severity: "critical",
        message: `${DOCUMENT_LABELS[type]} is missing for one or both applicants.`,
        fix: `Upload ${DOCUMENT_LABELS[type].toLowerCase()} for each applicant.`,
        step: 4,
      });
    }
  }

  const actDoc = ACT_DOCUMENT[application.act_code];
  if (actDoc && !documents.some((d) => d.type === actDoc)) {
    out.push({
      code: `DOC_MISSING_${actDoc}`,
      severity: "critical",
      message: `${rule.shortLabel} requires ${DOCUMENT_LABELS[actDoc].toLowerCase()}, which has not been uploaded.`,
      step: 4,
    });
  }

  const reference = application.marriage_date ? new Date(application.marriage_date) : new Date();

  for (const p of parties) {
    const who = partyLabel(p);

    if (p.marital_status_prior === "Divorced" && !documents.some((d) => d.type === "DIVORCE_DECREE")) {
      out.push({
        code: "DOC_MISSING_DIVORCE_DECREE",
        severity: "critical",
        message: `${who} is recorded as divorced, but no divorce decree has been uploaded.`,
        fix: "Upload the decree absolute. The office cannot proceed without proof the earlier marriage ended.",
        step: 4,
      });
    }

    if (
      p.marital_status_prior === "Widowed" &&
      !documents.some((d) => d.type === "DEATH_CERTIFICATE_SPOUSE")
    ) {
      out.push({
        code: "DOC_MISSING_DEATH_CERTIFICATE_SPOUSE",
        severity: "critical",
        message: `${who} is recorded as widowed, but no death certificate for the previous spouse has been uploaded.`,
        step: 4,
      });
    }

    if (p.date_of_birth) {
      const age = ageOn(p.date_of_birth, reference);
      const needsConsent = application.act_code === "ICMA_1872" ? age < 21 : false;
      if (needsConsent && age >= 18 && !documents.some((d) => d.type === "GUARDIAN_CONSENT")) {
        out.push({
          code: "DOC_MISSING_GUARDIAN_CONSENT",
          severity: "critical",
          message: `${who} is under 21, so guardian consent is required under the ${rule.shortLabel}.`,
          fix: "Upload the signed guardian consent.",
          step: 4,
        });
      }
    }
  }

  for (const d of documents) {
    if (d.status === "REJECTED") {
      out.push({
        code: "DOC_REJECTED",
        severity: "critical",
        message: `${DOCUMENT_LABELS[d.type]} was rejected by the office and must be replaced.`,
        step: 4,
      });
    }
  }
}

/* ------------------------------------------------------------------- entry */

export function runPreflight(input: PreflightInput): PreflightReport {
  const findings: Finding[] = [];

  checkEligibility(input, findings);
  checkTimeliness(input, findings);
  checkOffice(input, findings);
  checkParties(input, findings);
  checkWitnesses(input, findings);
  checkDocuments(input, findings);

  const order: Severity[] = ["critical", "warning", "note"];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  const counts: Record<Severity, number> = { critical: 0, warning: 0, note: 0 };
  for (const f of findings) counts[f.severity] += 1;

  return { findings, counts, clean: findings.length === 0 };
}
