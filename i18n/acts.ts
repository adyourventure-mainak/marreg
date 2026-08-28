import { ACT_CODES, type ActCode } from "../lib/acts";

/**
 * Message keys for each Act's document list, in the order `lib/acts.ts` lists
 * them. The documents are held as an array there and as named keys in the
 * message files, because a Bengali translator needs a stable name to attach a
 * string to and an array index is not one.
 *
 * `messages.test.ts` asserts these resolve to exactly the English strings in
 * `lib/acts.ts`, so a document added there without a translation fails.
 */
export const ACT_DOCUMENT_KEYS: Record<ActCode, readonly string[]> = {
  HMA_1955: ["photo", "age", "address", "identity", "priestCeremony"],
  SMA_13: ["photo", "age", "address", "identity", "affidavit"],
  SMA_16: ["photo", "age", "address", "identity", "earlier"],
  ICMA_1872: ["photo", "age", "address", "identity", "guardian"],
  PMDA_1936: ["photo", "age", "address", "identity", "priest"],
};

export { ACT_CODES, type ActCode };
