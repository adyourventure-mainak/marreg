import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import bn from "../messages/bn.json";
import { ACTS } from "../lib/acts";
import { ACT_CODES, ACT_DOCUMENT_KEYS } from "./acts";

type Tree = { [k: string]: string | Tree };

const paths = (node: Tree, prefix = ""): string[] =>
  Object.entries(node).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : paths(v, `${prefix}${k}.`),
  );

/** Every `{placeholder}` an ICU string expects, so both locales agree. */
const placeholders = (s: string) =>
  [...s.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort();

const leaf = (node: Tree, path: string): string =>
  path.split(".").reduce<string | Tree>((n, k) => (n as Tree)[k], node) as string;

const enPaths = paths(en as Tree);
const bnPaths = paths(bn as Tree);

/**
 * Keys that are English on the Bengali site on purpose.
 *
 * Finding an office is matched in English and by PIN, because that is what the
 * office register is written in. A Bengali label on this control would name
 * places in a script the search cannot answer to, so the control speaks the
 * language of the data behind it.
 *
 * Listed one key at a time rather than by prefix: the exemption should have to
 * be argued for each string, so the next untranslated value fails the way it
 * should instead of slipping under a wildcard.
 */
export const DELIBERATELY_ENGLISH = new Set([
  "Offices.nearMe",
  "Offices.nearMeLocating",
  "Offices.nearMeError.denied",
  "Offices.nearMeError.out-of-area",
  "Offices.nearMeError.unavailable",
]);

/**
 * A missing key does not fail a build — next-intl renders the key path, and a
 * key that exists but was never translated renders English on a Bengali page.
 * Neither shows up in a smoke test, so both are asserted here.
 */
describe("the two locales carry the same messages", () => {
  it("has a Bengali string for every English one", () => {
    expect(enPaths.filter((p) => !bnPaths.includes(p))).toEqual([]);
  });

  it("carries no Bengali string the English side has dropped", () => {
    expect(bnPaths.filter((p) => !enPaths.includes(p))).toEqual([]);
  });

  it("names the same placeholders in both locales", () => {
    const mismatched = enPaths
      .filter((p) => bnPaths.includes(p))
      .filter((p) => placeholders(leaf(en as Tree, p)).join() !== placeholders(leaf(bn as Tree, p)).join());
    expect(mismatched).toEqual([]);
  });

  it("leaves no Bengali value identical to its English source", () => {
    // Proper nouns and codes legitimately match; anything longer is a string
    // that was copied across and never translated.
    const untranslated = enPaths.filter((p) => {
      if (DELIBERATELY_ENGLISH.has(p)) return false;
      const e = leaf(en as Tree, p);
      return e.length > 24 && leaf(bn as Tree, p) === e;
    });
    expect(untranslated).toEqual([]);
  });

  it("keeps every exemption pointing at a key that still exists", () => {
    // An exemption for a deleted key would silently excuse nothing, and would
    // outlive the reason it was granted.
    expect([...DELIBERATELY_ENGLISH].filter((p) => !bnPaths.includes(p))).toEqual([]);
  });

  it("holds the location control to English on both sides", () => {
    // The point of the exemption, asserted rather than assumed.
    for (const p of DELIBERATELY_ENGLISH) {
      expect(leaf(bn as Tree, p), p).toBe(leaf(en as Tree, p));
    }
  });

  it("writes Bengali in Bengali script", () => {
    const notBengali = bnPaths.filter((p) => {
      if (DELIBERATELY_ENGLISH.has(p)) return false;
      const v = leaf(bn as Tree, p);
      return v.length > 24 && !/\p{Script=Bengali}/u.test(v);
    });
    expect(notBengali).toEqual([]);
  });
});

/**
 * `lib/acts.ts` stays the source of truth for the statutory periods, and its
 * own drift test ties those to the migration. Its display strings are
 * duplicated into the message files so they can be translated, which is a
 * second place to forget. These tests close that gap.
 */
describe("the Act messages match the Act rules they describe", () => {
  it("carries the same English label, short label and summary", () => {
    for (const code of ACT_CODES) {
      const m = (en as Tree).Acts as Tree;
      const rule = (m.rules as Tree)[code] as Tree;
      expect(rule.label, code).toBe(ACTS[code].label);
      expect(rule.shortLabel, code).toBe(ACTS[code].shortLabel);
      expect(rule.summary, code).toBe(ACTS[code].summary);
    }
  });

  it("carries the same document list, in the same order", () => {
    for (const code of ACT_CODES) {
      const docs = ((((en as Tree).Acts as Tree).rules as Tree)[code] as Tree).documents as Tree;
      expect(ACT_DOCUMENT_KEYS[code].map((k) => docs[k]), code).toEqual(ACTS[code].documents);
    }
  });

  it("translates every document name", () => {
    for (const code of ACT_CODES) {
      const docs = ((((bn as Tree).Acts as Tree).rules as Tree)[code] as Tree).documents as Tree;
      for (const key of ACT_DOCUMENT_KEYS[code]) {
        expect(docs[key], `${code}.${key}`).toMatch(/\p{Script=Bengali}/u);
      }
    }
  });
});
