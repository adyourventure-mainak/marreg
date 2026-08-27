import type { Party } from "../types";
import type { Extracted } from "./types";

/**
 * Layer 3 — comparing what a document says against what was typed.
 *
 * Deliberately not the model's job. The model reports what is printed; this
 * file decides whether that agrees with the application, in plain TypeScript
 * where the rule is visible, deterministic and unit-tested.
 *
 * Every result here is an observation for the Marriage Officer, never a
 * decision. Indian names legitimately vary between documents — transliteration
 * (Chattopadhyay / Chatterjee), initials, married surnames, honorifics. A
 * mismatch is a prompt to look, not evidence of anything.
 */

export type MatchLevel = "match" | "partial" | "differs" | "unknown";

export type Discrepancy = {
  code: "NAME_DIFFERS" | "NAME_PARTIAL" | "DOB_DIFFERS" | "DOB_YEAR_ONLY" | "TYPE_DIFFERS";
  severity: "high" | "low";
  /** What the officer should notice, phrased factually. */
  message: string;
  /** Value printed on the document. */
  onDocument: string;
  /** Value entered in the application. */
  onApplication: string;
};

const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "smt", "shri", "sri", "sm", "md", "mohd",
  "dr", "prof", "late", "kumari", "km",
]);

/**
 * Reduce a name to comparable tokens.
 *
 * Strips diacritics, punctuation and honorifics, lowercases, and splits on
 * whitespace. Word order is not preserved by the caller's comparison, because
 * "Sen Roy Aparna" and "Aparna Sen Roy" are the same person filed differently.
 */
export function nameTokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !HONORIFICS.has(t));
}

/** Does `short` read as an initial or abbreviation of `long`? */
function abbreviates(short: string, long: string): boolean {
  if (short.length >= long.length) return false;
  return long.startsWith(short);
}

/** Length of the common leading run of two strings. */
function sharedPrefix(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Bengali surnames that routinely appear in two forms on two documents.
 *
 * The anglicised ("-jee") and Sanskritised ("-opadhyay") spellings are the
 * same surname, and both are in everyday use in West Bengal — one on a voter
 * card, the other on a school certificate, for the same person. A prefix rule
 * cannot catch Banerjee / Bandyopadhyay, which agree on only three letters,
 * so the pairs are named outright.
 *
 * Each entry maps a spelling to a shared canonical key. Extend it as real
 * applications surface more pairs.
 */
const SURNAME_VARIANTS: Record<string, string> = {
  banerjee: "bandyo", banerji: "bandyo", bandopadhyay: "bandyo",
  bandyopadhyay: "bandyo", banerjea: "bandyo",

  chatterjee: "chatto", chatterji: "chatto", chattopadhyay: "chatto",
  chattopadhyaya: "chatto", chatterjea: "chatto",

  mukherjee: "mukho", mukherji: "mukho", mukhopadhyay: "mukho",
  mukhopadhyaya: "mukho", mukherjea: "mukho",

  ganguly: "gango", ganguli: "gango", gangopadhyay: "gango",
  gangopadhyaya: "gango",

  bhattacharya: "bhatta", bhattacharyya: "bhatta", bhattacharjee: "bhatta",
  bhattacharji: "bhatta",
};

/**
 * Two spellings of what is plausibly the same name part.
 *
 * Either a known surname variant, or two long tokens agreeing on a
 * substantial prefix (Chattopadhyay / Chattopadhyaya, Debnath / Debnathi).
 * Calling these mismatches would flag a large share of genuine applications,
 * so they are reported as `partial` — the officer is told to look, not told
 * there is a problem.
 */
function nearlySame(a: string, b: string): boolean {
  const va = SURNAME_VARIANTS[a];
  const vb = SURNAME_VARIANTS[b];
  if (va && vb) return va === vb;
  // A known variant should not then be softened into an unrelated surname by
  // the prefix rule — Bhattacharya and Bhattacharjee are the same name, but
  // Chatterjee and Bhattacharya are not.
  if (va || vb) return false;
  if (a.length < 5 || b.length < 5) return false;
  return sharedPrefix(a, b) >= 4;
}

/**
 * Compare two names as written on two different pieces of paper.
 *
 * - `match`   — same tokens, any order.
 * - `partial` — one is a subset, or differs only by initials/abbreviations.
 *               Normal and usually fine; worth a glance.
 * - `differs` — tokens that cannot be reconciled.
 */
export function compareNames(onDocument: string, onApplication: string): MatchLevel {
  const a = nameTokens(onDocument);
  const b = nameTokens(onApplication);
  if (a.length === 0 || b.length === 0) return "unknown";

  const remaining = [...b];
  let matched = 0;
  let approximated = 0;

  for (const token of a) {
    const exact = remaining.indexOf(token);
    if (exact !== -1) {
      remaining.splice(exact, 1);
      matched += 1;
      continue;
    }
    const near = remaining.findIndex(
      (t) => abbreviates(token, t) || abbreviates(t, token) || nearlySame(token, t),
    );
    if (near !== -1) {
      remaining.splice(near, 1);
      approximated += 1;
    }
  }

  const accounted = matched + approximated;
  // Nothing lined up at all — two different names.
  if (accounted === 0) return "differs";
  // Every token on both sides accounted for, all exactly.
  if (accounted === a.length && remaining.length === 0 && approximated === 0) return "match";
  // A surname or given name is missing on one side, or initials were used.
  if (accounted >= Math.min(a.length, b.length)) return "partial";
  return "differs";
}

/** yyyy-mm-dd → parts, or null if it is not a plain ISO date. */
function isoParts(value: string): { y: string; m: string; d: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return m ? { y: m[1], m: m[2], d: m[3] } : null;
}

/**
 * Compare dates of birth.
 *
 * A great many Indian identity documents carry a year-only or 1-January date
 * of birth where the real one was never recorded. That is a documented quirk,
 * not a discrepancy, so it is reported separately and softly.
 */
export function compareDates(onDocument: string, onApplication: string): MatchLevel {
  const a = isoParts(onDocument);
  const b = isoParts(onApplication);
  if (!a || !b) return "unknown";
  if (a.y === b.y && a.m === b.m && a.d === b.d) return "match";
  if (a.y === b.y) return "partial";
  return "differs";
}

/** True for the placeholder DOBs that Indian ID documents commonly carry. */
export function isPlaceholderDob(value: string): boolean {
  const p = isoParts(value);
  return p !== null && p.m === "01" && p.d === "01";
}

/**
 * All discrepancies between one extracted document and the applicant it was
 * uploaded for. Returns an empty array when the document was not attributed to
 * a party — there is then nothing to compare it against.
 */
export function compareToParty(extracted: Extracted, party: Party | null): Discrepancy[] {
  if (!party) return [];
  const out: Discrepancy[] = [];

  if (extracted.name_as_printed && party.name_english) {
    const level = compareNames(extracted.name_as_printed, party.name_english);
    if (level === "differs") {
      out.push({
        code: "NAME_DIFFERS",
        severity: "high",
        message: "The name on this document does not match the name on the application.",
        onDocument: extracted.name_as_printed,
        onApplication: party.name_english,
      });
    } else if (level === "partial") {
      out.push({
        code: "NAME_PARTIAL",
        severity: "low",
        message: "The name is close but not identical — initials, spelling or a missing part.",
        onDocument: extracted.name_as_printed,
        onApplication: party.name_english,
      });
    }
  }

  if (extracted.date_of_birth && party.date_of_birth) {
    const level = compareDates(extracted.date_of_birth, party.date_of_birth);
    if (level === "differs") {
      out.push({
        code: "DOB_DIFFERS",
        severity: "high",
        message: "The date of birth on this document is a different year to the application.",
        onDocument: extracted.date_of_birth,
        onApplication: party.date_of_birth,
      });
    } else if (level === "partial") {
      out.push({
        code: "DOB_YEAR_ONLY",
        severity: "low",
        message: isPlaceholderDob(extracted.date_of_birth)
          ? "The document shows 1 January, which many Indian ID documents use when the exact date was never recorded. The year agrees."
          : "The year of birth agrees but the day or month differs.",
        onDocument: extracted.date_of_birth,
        onApplication: party.date_of_birth,
      });
    }
  }

  return out;
}
