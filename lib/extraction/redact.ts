/**
 * PII redaction, applied to everything a model returns before it is persisted.
 *
 * Why this is not optional: these are third parties' identity documents. The
 * Aadhaar Act restricts storing Aadhaar numbers, and the DPDP Act 2023 applies
 * to the rest. The application never needs a full ID number — the last four
 * digits are enough to tell two documents apart — so we never keep one.
 *
 * The rule is deliberately blunt: mask first, and accept over-masking. A
 * mangled address is a cosmetic problem; a stored Aadhaar number is a legal
 * one.
 */

/** Keys whose value is always reduced to its last four characters. */
const SENSITIVE_KEY = /(aadhaar|aadhar|uid(ai)?|pan|passport|epic|voter|licen[cs]e|account|ssn)/i;

/** Keys whose value must be left exactly alone. */
const PRESERVE_KEY = /^(date_of_birth|legibility|document_type_guess|id_number_last4)$/;

const AADHAAR = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const EPIC = /\b[A-Z]{3}\d{7}\b/g;
const LONG_DIGITS = /\d{9,}/g;

/** Keep the last `keep` characters, replace everything before with •. */
export function maskAllBut(value: string, keep = 4): string {
  const trimmed = value.replace(/[\s-]/g, "");
  if (trimmed.length <= keep) return trimmed;
  return "•".repeat(trimmed.length - keep) + trimmed.slice(-keep);
}

/** Redact identifier-shaped substrings inside a free-text string. */
export function redactText(input: string): string {
  return input
    .replace(AADHAAR, (m) => maskAllBut(m))
    .replace(PAN, (m) => maskAllBut(m))
    .replace(EPIC, (m) => maskAllBut(m))
    .replace(LONG_DIGITS, (m) => maskAllBut(m));
}

/** Last four alphanumeric characters of an identifier, or null. */
export function lastFour(value: string | null | undefined): string | null {
  if (!value) return null;
  const alnum = value.replace(/[^A-Za-z0-9]/g, "");
  if (alnum.length === 0) return null;
  return alnum.slice(-4);
}

/**
 * Walk any JSON value and redact it.
 *
 * Applied to the whole model response rather than to named fields, because the
 * field that leaks an ID number is always the one nobody thought to list.
 */
export function redactDeep(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (key && PRESERVE_KEY.test(key)) return value;
    if (key && SENSITIVE_KEY.test(key)) return lastFour(value);
    return redactText(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    // A bare number long enough to be an identifier should not survive either.
    if (typeof value === "number" && key && SENSITIVE_KEY.test(key)) {
      return lastFour(String(value));
    }
    if (typeof value === "number" && Math.abs(value) >= 1e8 && !(key && PRESERVE_KEY.test(key))) {
      return maskAllBut(String(value));
    }
    return value;
  }

  if (Array.isArray(value)) return value.map((v) => redactDeep(v, key));

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v, k);
    }
    return out;
  }

  return value;
}

/**
 * Final gate before persistence.
 *
 * Throws rather than silently storing if anything Aadhaar-shaped survived —
 * a loud failure that requeues the job is the right outcome, because the
 * alternative is a compliance breach written to disk.
 */
export function assertNoRawIdentifiers(payload: unknown): void {
  const serialised = JSON.stringify(payload ?? {});
  if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(serialised) || /\d{9,}/.test(serialised)) {
    throw new Error("Redaction failed: an identifier-shaped value survived into the payload");
  }
}

/** Redact, then verify. Use this, not redactDeep, at the persistence boundary. */
export function redactForStorage<T>(payload: T): unknown {
  const redacted = redactDeep(payload);
  assertNoRawIdentifiers(redacted);
  return redacted;
}
