/**
 * Compare the directory in the database against the source PDFs.
 *
 *   node scripts/extract-officers.mjs "MO List District wise" /tmp/officers.json
 *   node scripts/verify-officers.mjs /tmp/officers.json
 *
 * Verifying a district is a statement that the register matches the published
 * list. This is what makes that statement checkable rather than a promise: it
 * re-reads every PDF and compares the fields a citizen actually acts on --
 * the officer's name, address, PIN, telephone numbers and working hours --
 * against the row that would be published.
 *
 * It decides nothing. It prints what agrees and what does not, per district,
 * so a reviewer can verify the clean districts and look at the rest. A district
 * with a single discrepancy should not be approved in bulk.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const DISTRICT_CODES = JSON.parse(readFileSync(new URL("./district-codes.json", import.meta.url), "utf8"));

/** Must stay identical to officeCode() in import-officers.mjs. */
function officeCode(districtCode, r) {
  const digest = createHash("sha256")
    .update(`${districtCode}|${r.officer_name}|${r.pincode ?? ""}|${r.address}`)
    .digest("hex").slice(0, 6).toUpperCase();
  return `${districtCode}-MO-${digest}`;
}

/**
 * Canonical form for comparison.
 *
 * jsonb does not preserve the key order it was given -- Postgres stores keys
 * sorted by length, then bytewise -- so working_hours comes back with its days
 * shuffled. Comparing the serialised form reported all 554 records as
 * differing when every value was in fact identical. Order is not part of the
 * data, so it is normalised away before comparing.
 */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  }
  return v ?? null;
}

const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function differences(pdf, row) {
  const out = [];
  const check = (field, expected, actual) => {
    if (!same(expected, actual)) out.push(`${field}: pdf=${JSON.stringify(expected)} db=${JSON.stringify(actual)}`);
  };
  check("officer_name", pdf.officer_name, row.officer_name);
  check("address", pdf.address, row.address);
  check("pincode", pdf.pincode, row.pincode);
  check("phones", pdf.phones, row.phones);
  check("working_hours", pdf.working_hours, row.working_hours);
  check("source_page", pdf.source_page, row.source_page);
  check("source_document", pdf.source_document, row.source_document);
  return out;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const records = JSON.parse(readFileSync(process.argv[2] ?? "/tmp/officers.json", "utf8"));

const { data: rows, error } = await supabase
  .from("offices").select("*").not("source_document", "is", null);
if (error) { console.error("read failed:", error.message); process.exit(1); }
const byCode = new Map(rows.map((r) => [r.office_code, r]));

const districts = new Map();
for (const r of records) {
  const code = DISTRICT_CODES[r.district_label];
  if (!code) { console.error(`Unmapped district label: ${r.district_label}`); process.exit(1); }
  const d = districts.get(code) ?? { code, label: r.district_label, matched: 0, problems: [], pending: 0 };
  const row = byCode.get(officeCode(code, r));
  if (!row) {
    d.problems.push(`MISSING from the register: ${r.officer_name} (${r.source_document} p${r.source_page})`);
  } else {
    const diff = differences(r, row);
    if (diff.length) d.problems.push(`${r.officer_name}: ${diff.join("; ")}`);
    else d.matched++;
    byCode.delete(row.office_code);
  }
  districts.set(code, d);
}

// Anything left in the register that no PDF accounts for.
for (const row of byCode.values()) {
  const d = districts.get(row.district_code) ?? { code: row.district_code, label: row.district_code, matched: 0, problems: [], pending: 0 };
  d.problems.push(`IN REGISTER but not in any PDF: ${row.officer_name} (${row.office_code})`);
  districts.set(row.district_code, d);
}

for (const d of districts.values()) {
  d.pending = rows.filter((r) => r.district_code === d.code && r.verification_status === "PENDING_REVIEW").length;
}

const clean = [];
let problemCount = 0;
console.log("district                      matched  pending  discrepancies");
for (const d of [...districts.values()].sort((a, b) => a.code.localeCompare(b.code))) {
  const flag = d.problems.length ? `${d.problems.length}  <-- LOOK` : "0";
  console.log(`  ${d.code}  ${d.label.padEnd(20)} ${String(d.matched).padStart(4)} ${String(d.pending).padStart(8)}     ${flag}`);
  for (const p of d.problems.slice(0, 5)) console.log(`        ${p}`);
  problemCount += d.problems.length;
  if (!d.problems.length && d.pending > 0) clean.push({ code: d.code, pending: d.pending });
}

console.log(`\n${records.length} records checked, ${problemCount} discrepancies`);
console.log(`districts clean and awaiting review: ${clean.length}`);
console.log(JSON.stringify(clean));
