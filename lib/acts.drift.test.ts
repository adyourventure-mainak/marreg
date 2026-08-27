import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTS, ACT_CODES, type ActCode } from "./acts";

/**
 * The statutory periods live in two places: the `act_rules` table, which the
 * registry actually enforces, and ACTS in lib/acts.ts, which is what a citizen
 * is shown. Divergence is a legal defect, not a cosmetic one — a page could
 * promise a 30-day objection window while the database closed it after 7.
 *
 * Rather than trust a comment, this parses the seed out of the migration and
 * compares it row by row. Amending one without the other fails the build.
 */

const MIGRATION = join(__dirname, "..", "supabase", "migrations", "20260825000700_act_rules.sql");

type SeedRow = {
  objectionDays: number;
  noticeDays: number | null;
  deadlineMonths: number;
  alreadySolemnised: boolean;
  minimumDaysAfterMarriage: number | null;
  minimumAge: number;
  displayOrder: number;
  requiredWitnesses: number;
};

function parseSeed(sql: string): Record<string, SeedRow> {
  const block = sql.match(/-- MARREG-SEED-BEGIN([\s\S]*?)-- MARREG-SEED-END/);
  if (!block) throw new Error("seed markers not found in the act_rules migration");

  // Only the VALUES tuples, i.e. everything between `values` and the
  // `on conflict` clause, so the column list and upsert body are not scanned.
  const values = block[1].split(/\bvalues\b/i)[1]?.split(/\bon conflict\b/i)[0];
  if (!values) throw new Error("could not isolate the VALUES list");

  const rows: Record<string, SeedRow> = {};
  const tuple = /\(\s*'([A-Z_0-9]+)'\s*,([^)]*)\)/g;
  for (const m of values.matchAll(tuple)) {
    const fields = m[2].split(",").map((f) => f.trim());
    if (fields.length !== 8) throw new Error(`row ${m[1]} has ${fields.length} fields, expected 8`);
    const num = (f: string) => (f === "null" ? null : Number(f));
    const required = (f: string) => {
      const n = num(f);
      if (n === null || Number.isNaN(n)) throw new Error(`row ${m[1]}: expected a number, got "${f}"`);
      return n;
    };
    rows[m[1]] = {
      objectionDays: required(fields[0]),
      noticeDays: num(fields[1]),
      deadlineMonths: required(fields[2]),
      alreadySolemnised: fields[3] === "true",
      minimumDaysAfterMarriage: num(fields[4]),
      minimumAge: required(fields[5]),
      displayOrder: required(fields[6]),
      requiredWitnesses: required(fields[7]),
    };
  }
  return rows;
}

const seed = parseSeed(readFileSync(MIGRATION, "utf8"));

describe("act rules mirror the database", () => {
  it("parses every Act out of the migration", () => {
    // Guards the parser itself: a regex that silently matched nothing would
    // otherwise make every comparison below vacuously pass.
    expect(Object.keys(seed).sort()).toEqual([...ACT_CODES].sort());
  });

  it.each(ACT_CODES)("%s matches the act_rules seed", (code: ActCode) => {
    const ts = ACTS[code];
    const db = seed[code];
    expect(db.objectionDays).toBe(ts.objectionDays);
    expect(db.noticeDays).toBe(ts.noticeDays ?? null);
    expect(db.deadlineMonths).toBe(ts.deadlineMonths);
    expect(db.alreadySolemnised).toBe(ts.alreadySolemnised);
    expect(db.minimumDaysAfterMarriage).toBe(ts.minimumDaysAfterMarriage ?? null);
    expect(db.minimumAge).toBe(ts.minimumAge);
    expect(db.requiredWitnesses).toBe(ts.requiredWitnesses);
  });

  it("orders the Acts the same way the UI lists them", () => {
    const byOrder = Object.entries(seed)
      .sort((a, b) => a[1].displayOrder - b[1].displayOrder)
      .map(([code]) => code);
    expect(byOrder).toEqual([...ACT_CODES]);
  });
});
