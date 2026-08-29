import { bridgeBengali, hasBengali } from "./glossary";
import type { ActCode } from "../acts";

/**
 * The questions the public actually asks, mapped to the sections that answer them.
 *
 * Free-text search is good at finding a section that shares vocabulary with a
 * question and bad at finding one that does not. "How long after the notice?"
 * has to land on section 7 of the Special Marriage Act, but the words a citizen
 * uses and the words the draftsman used barely overlap, so ranking decides it
 * and ranking is not reliable for the handful of questions that make up most of
 * the traffic.
 *
 * So the common questions are routed to their sections directly. Three
 * properties follow, and all three matter:
 *
 *   * No answer text is written here. An entry names sections; the words the
 *     citizen reads are the statute's own, fetched from knowledge_chunks at
 *     request time. There is nothing in this file for a reviewer to fact-check
 *     because it asserts nothing about the law.
 *   * The review gate still holds. Sections are read through the same
 *     RLS-guarded table as everything else, so an entry pointing at an
 *     unverified source yields nothing at all rather than leaking it.
 *   * It is bilingual by construction, matching on the glossary's English
 *     bridge, so a Bengali question reaches the same entry as its English twin.
 */

export type FaqEntry = {
  id: string;
  /** Scope, when the answer differs by Act. Null means it is asked generally. */
  act: ActCode | null;
  /** Heading prefixes in knowledge_chunks, matched case-insensitively. */
  sections: string[];
  /** English keywords; ALL must be present for the entry to match. */
  match: string[][];
};

/**
 * Each `match` row is a set of alternatives; every row must hit. So
 * [["witness","witnesses"],["how many","number"]] means a witness word AND a
 * quantity word — which keeps "who can be a witness" from matching the entry
 * about how many are required.
 */
export const FAQ: FaqEntry[] = [
  {
    id: "witnesses",
    act: null,
    sections: ["Section 11. Declaration by parties and witnesses", "Section 8. Registration of Hindu marriages"],
    match: [["witness", "witnesses"], ["how many", "number", "required", "need", "needed", "must"]],
  },
  {
    id: "objection-period",
    act: null,
    sections: ["Section 7. Objection to marriage", "Section 8. Procedure on receipt of objection", "Section 5. Notice of intended marriage"],
    match: [["objection", "object"], ["period", "days", "time", "long", "when", "deadline"]],
  },
  {
    id: "notice",
    act: null,
    sections: ["Section 5. Notice of intended marriage", "Section 6. Marriage Notice Book and publication"],
    match: [["notice"], ["give", "file", "submit", "publish", "before", "how", "what"]],
  },
  {
    id: "conditions-hindu",
    act: "HMA_1955",
    sections: ["Section 5. Conditions for a Hindu marriage", "Section 7. Ceremonies for a Hindu marriage"],
    match: [["condition", "requirement", "eligible", "age", "who can"], ["hindu"]],
  },
  {
    id: "conditions-special",
    act: null,
    sections: ["Section 4. Conditions relating to solemnization of special marriages"],
    match: [["condition", "requirement", "age", "who can"], ["special", "court", "civil", "inter"]],
  },
  {
    id: "register-hindu",
    act: "HMA_1955",
    sections: ["Section 8. Registration of Hindu marriages"],
    match: [["registration", "register"], ["hindu"]],
  },
  {
    id: "certificate",
    act: null,
    sections: ["Section 13. Certificate of marriage"],
    match: [["certificate"], ["marriage", "get", "issue", "obtain", "how"]],
  },
  {
    id: "notice-expiry",
    act: null,
    sections: ["Section 14. New notice when marriage not solemnized within three months"],
    match: [["notice"], ["expire", "expiry", "lapse", "three months", "valid", "again"]],
  },
  {
    id: "where-solemnized",
    act: null,
    sections: ["Section 12. Place and form of solemnization"],
    match: [["place", "where", "venue"], ["solemn", "marriage", "ceremony"]],
  },
  {
    id: "marriage-officer",
    act: null,
    sections: ["Section 3. Marriage Officers", "Section 9. Powers of Marriage Officers in respect of inquiries"],
    match: [["marriage officer", "officer"], ["who", "power", "appoint", "what does", "role"]],
  },
];

/** Normalise a question — Bengali bridged to English — for matching. */
export function normalise(question: string): string {
  const source = hasBengali(question) ? bridgeBengali(question) : question;
  return source.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The FAQ entry this question is asking, if any.
 *
 * Returns the most specific match — the entry with the most required rows —
 * so "how do I register a Hindu marriage" prefers the Hindu entry over the
 * general one.
 */
export function matchFaq(question: string, act: ActCode | null = null): FaqEntry | null {
  const q = normalise(question);

  const hits = FAQ.filter((entry) => {
    if (entry.act && act && entry.act !== act) return false;
    return entry.match.every((alternatives) => alternatives.some((word) => q.includes(word)));
  });

  if (hits.length === 0) return null;
  // Prefer an Act-scoped entry, then the one with the most conditions met.
  return hits.sort((a, b) =>
    Number(Boolean(b.act)) - Number(Boolean(a.act)) ||
    b.match.flat().length - a.match.flat().length)[0];
}
