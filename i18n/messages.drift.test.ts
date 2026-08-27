import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import bn from "../messages/bn.json";
import { LOCALES } from "./config";

/** Every leaf key, as dotted paths, so two catalogues can be compared directly. */
function paths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    paths(v, prefix ? `${prefix}.${k}` : k),
  );
}

function leaves(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (value === null || typeof value !== "object") return [[prefix, value]];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  );
}

const enPaths = paths(en);
const bnPaths = paths(bn);

describe("message catalogues", () => {
  it("parses a non-trivial number of keys", () => {
    // Guards the comparisons below: if the traversal returned nothing, every
    // set difference would be empty and each test would pass vacuously.
    expect(enPaths.length).toBeGreaterThan(40);
  });

  it("covers one catalogue per locale", () => {
    expect(LOCALES.length).toBe(2);
  });

  it("has no key in English that is missing from Bengali", () => {
    const missing = enPaths.filter((p) => !bnPaths.includes(p));
    expect(missing).toEqual([]);
  });

  it("has no key in Bengali that no longer exists in English", () => {
    const orphaned = bnPaths.filter((p) => !enPaths.includes(p));
    expect(orphaned).toEqual([]);
  });

  it("has no empty or placeholder values", () => {
    for (const [locale, catalogue] of [["en", en], ["bn", bn]] as const) {
      for (const [path, value] of leaves(catalogue)) {
        expect(typeof value, `${locale}:${path} should be a string`).toBe("string");
        expect(String(value).trim(), `${locale}:${path} is empty`).not.toBe("");
        expect(String(value), `${locale}:${path} looks like a TODO`).not.toMatch(/^(TODO|FIXME|XXX)/i);
      }
    }
  });

  it("actually contains Bengali script, not copied English", () => {
    // A catalogue duplicated from English would pass every check above.
    const bengali = /[ঀ-৿]/;
    const untranslated = leaves(bn)
      .filter(([path, value]) => {
        if (path === "Header.switchTo") return false; // deliberately "English"
        if (path === "Home.badge") return false;      // contains the product name
        return !bengali.test(String(value));
      })
      .map(([path]) => path);
    expect(untranslated).toEqual([]);
  });
});
