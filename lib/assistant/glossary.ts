/**
 * Bengali → English retrieval bridge.
 *
 * The corpus is English. Every knowledge_chunk holds the text of an Act as the
 * department published it, and none of the 168 of them contains a single
 * Bengali character. The tsvector is built with the 'english' configuration
 * over that English text.
 *
 * So a Bengali question could never retrieve anything — not because the
 * tokeniser mishandled the script, but because there was nothing in the index
 * for it to match. Measured against the live corpus, every Bengali query
 * returned zero passages, which the assistant then reported to the citizen as
 * "I could not find this in the approved sources" — a statement about the law,
 * made on the strength of a language mismatch. The Bengali half of a bilingual
 * public service answered nothing at all.
 *
 * This maps the words a citizen actually types to the words the statute
 * actually uses. It is a lookup table rather than a translation model on
 * purpose, for the same reason the retrieval layer uses full-text search rather
 * than embeddings: a reviewer can read this file and see exactly why a section
 * was retrieved. A model in this position could silently reshape the question
 * and there would be no record of it having done so.
 *
 * Terms are the vocabulary of the Acts and of the registration process, not a
 * general dictionary. Each maps to the English word the draftsman used, so the
 * mapped query hits the same index entries an English question would.
 */

/** Bengali term → the English word(s) the statutes use for it. */
export const BENGALI_TERMS: Record<string, string> = {
  // --- the process ---------------------------------------------------------
  "বিবাহ": "marriage",
  "বিয়ে": "marriage",
  "নিবন্ধন": "registration",
  "রেজিস্ট্রেশন": "registration",
  "নথিভুক্ত": "registration",
  "আবেদন": "application",
  "নোটিশ": "notice",
  "বিজ্ঞপ্তি": "notice",
  "ঘোষণা": "declaration",
  "শংসাপত্র": "certificate",
  "সার্টিফিকেট": "certificate",
  "প্রমাণপত্র": "certificate",

  // --- people --------------------------------------------------------------
  "সাক্ষী": "witness",
  "পাত্র": "bridegroom",
  "পাত্রী": "bride",
  "বর": "bridegroom",
  "কনে": "bride",
  "স্বামী": "husband",
  "স্ত্রী": "wife",
  "অভিভাবক": "guardian",
  "পুরোহিত": "priest",
  "নিবন্ধক": "registrar",
  "রেজিস্ট্রার": "registrar",
  "অফিসার": "officer",
  "কর্মকর্তা": "officer",

  // --- conditions and objections ------------------------------------------
  "আপত্তি": "objection",
  "শর্ত": "condition",
  "বয়স": "age",
  "বৈধ": "valid",
  "অবৈধ": "void",
  "নিষিদ্ধ": "prohibited",
  "সম্পর্ক": "relationship",
  "সম্মতি": "consent",
  "ধর্ম": "religion",
  "ধর্মান্তর": "conversion",
  "তালাক": "divorce",
  "বিচ্ছেদ": "divorce",
  "ভরণপোষণ": "maintenance",
  "উত্তরাধিকার": "succession",

  // --- documents and places -----------------------------------------------
  "নথি": "document",
  "দলিল": "document",
  "প্রমাণ": "proof",
  "ঠিকানা": "address",
  "জেলা": "district",
  "অফিস": "office",
  "কার্যালয়": "office",
  "ফি": "fee",
  "খরচ": "fee",
  "সময়": "period",

  // --- question and quantity words -----------------------------------------
  // Not statutory vocabulary, but the FAQ router keys on them: an entry
  // requires a topic word AND a quantity word, so "কতজন সাক্ষী" has to reach
  // "how many witness" or it falls through to plain search.
  "কতজন": "how many",
  "কতটি": "how many",
  "কয়টি": "how many",
  "কত": "how many",
  "প্রয়োজন": "required",
  "লাগে": "required",
  "আবশ্যক": "required",
  "কোথায়": "where",
  "কীভাবে": "how",
  "কিভাবে": "how",
  "কারা": "who",
  "যোগ্যতা": "eligible",
  "সীমা": "period",
  "দিন": "days",
  "মাস": "month",
};

/**
 * Rewrite the Bengali words in a question into the statute's own English.
 *
 * Non-Bengali text is passed through untouched, so an English question — and
 * the English half of a mixed one — is unaffected. Matching is longest-term
 * first so that a term containing a shorter one is not part-replaced.
 */
export function bridgeBengali(question: string): string {
  const ordered = Object.keys(BENGALI_TERMS).sort((a, b) => b.length - a.length);
  let out = question;
  for (const term of ordered) {
    if (out.includes(term)) out = out.split(term).join(` ${BENGALI_TERMS[term]} `);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Does this text contain Bengali script at all? */
export function hasBengali(text: string): boolean {
  return /[ঀ-৿]/.test(text);
}
