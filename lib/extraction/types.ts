import { z } from "zod";
import type { DocumentType } from "../types";
import type { Finding } from "../preflight";

/**
 * What the vision model is asked to return for a single document.
 *
 * One job only: report what the document *says*. No judgement about whether
 * the application is consistent — that comparison happens in TypeScript
 * (Layer 3), where it is deterministic and testable.
 */
export const ExtractedSchema = z.object({
  /** What kind of document the model believes this is. */
  document_type_guess: z.string().nullable(),
  /** The person's name exactly as printed, no normalisation. */
  name_as_printed: z.string().nullable(),
  /** ISO yyyy-mm-dd if a date of birth is printed. */
  date_of_birth: z.string().nullable(),
  /** Address as printed, newlines collapsed. */
  address: z.string().nullable(),
  /** Last four characters of any ID number. NEVER the whole number. */
  id_number_last4: z.string().nullable(),
  /** Who issued it — "Election Commission of India", "UIDAI", a hospital, … */
  issuing_authority: z.string().nullable(),
  /** 0 = unreadable, 1 = perfectly clear. */
  legibility: z.number().min(0).max(1),
  /** Free-text observations, e.g. "photograph is obscured", "page is cut off". */
  warnings: z.array(z.string()).default([]),
});

export type Extracted = z.infer<typeof ExtractedSchema>;

export type ClaimedJob = {
  job_id: string;
  document_id: string;
  application_id: string;
  document_type: DocumentType;
  storage_path: string;
  mime_type: string | null;
  attempts: number;
};

export type ExtractionResult = {
  extracted: Extracted;
  findings: Finding[];
  legibility: number;
  model: string;
};

/** Below this, a human will struggle too — worth telling the applicant. */
export const LEGIBILITY_FLOOR = 0.55;

/**
 * The single finding Layer 2 can make on its own.
 *
 * Anything comparing one document against another (name mismatch, DOB
 * mismatch) belongs to Layer 3 and is deliberately not produced here.
 */
export function legibilityFindings(extracted: Extracted, label: string): Finding[] {
  const findings: Finding[] = [];

  if (extracted.legibility < LEGIBILITY_FLOOR) {
    findings.push({
      code: "DOC_ILLEGIBLE",
      severity: "warning",
      message: `The scan of your ${label.toLowerCase()} is hard to read.`,
      fix: "Re-take it in good light, with the whole document flat in frame and no glare. An unreadable scan is one of the most common reasons an office asks for a document again.",
      step: 4,
    });
  }

  for (const w of extracted.warnings.slice(0, 3)) {
    findings.push({
      code: "DOC_OBSERVATION",
      severity: "note",
      message: `${label}: ${w}`,
      step: 4,
    });
  }

  return findings;
}
