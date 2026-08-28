import type { ActCode } from "../acts";

/** One retrieved span of an approved source document. */
export type Passage = {
  /** 1-based index as shown to the model and to the citizen. */
  index: number;
  kind: "ACT" | "OFFICE";
  /** How this passage must be attributed, e.g. "The Hindu Marriage Act, 1955". */
  citation: string;
  /** The section or record label, e.g. "Section 8. Registration of Hindu marriages". */
  heading: string;
  body: string;
  /** Page in the source PDF, for an Act passage. */
  page?: number | null;
  /** Where a citizen can go to read the same record on this site. */
  href?: string;
  /**
   * Strings that must reach the citizen exactly as the register holds them.
   *
   * An officer's name is an identifier, not prose. Restoring these after the
   * model has written is what makes "copied exactly" true rather than
   * requested — see restoreVerbatim() in answer.ts.
   */
  verbatim?: string[];
};

export type AssistantAnswer = {
  answered: boolean;
  /** Plain text. Empty when `answered` is false. */
  text: string;
  passages: Passage[];
  /** Present when the assistant declined; safe to show to a citizen verbatim. */
  refusal?: string;
  model?: string;
};

export type AssistantRequest = {
  question: string;
  act?: ActCode | null;
  locale?: string;
};
