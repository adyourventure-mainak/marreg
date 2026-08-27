/**
 * Load the extracted Marriage Officer directory into Supabase.
 *
 *   node scripts/extract-officers.mjs "MO List District wise" /tmp/officers.json
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-officers.mjs /tmp/officers.json
 *
 * Everything lands as PENDING_REVIEW. Nothing this script writes is visible to
 * a citizen until registry staff verify it — that is enforced by the read
 * policy in 20260825001200_officer_directory.sql, not by this script.
 *
 * The extracted JSON is deliberately not committed: it carries 554 named
 * officers' personal mobile numbers, and the repository is not the right place
 * to republish them. Re-run the extractor from the PDFs instead.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * District labels exactly as printed in the source PDFs, mapped to the codes
 * already seeded in `districts`. Explicit rather than fuzzy-matched: a wrong
 * guess here files an officer under the wrong district, which is precisely the
 * error a citizen cannot detect.
 */
const DISTRICT_CODES = {
  "ALIPURDUAR": "WB-ALP",
  "BANKURA": "WB-BAN",
  "BIRBHUM": "WB-BIR",
  "COOCHBEHAR": "WB-COB",
  "DAKSHIN DINAJPUR": "WB-DDJ",
  "DARJEELING": "WB-DAR",
  "HOOGHLY": "WB-HOO",
  "HOWRAH": "WB-HOW",
  "JALPAIGURI": "WB-JAL",
  "JHARGRAM": "WB-JHA",
  "KALIMPONG": "WB-KAL",
  "KOLKATA": "WB-KOL",
  "MALDA": "WB-MAL",
  "MURSHIDABAD": "WB-MUR",
  "NADIA": "WB-NAD",
  "24 PARGANAS(N)": "WB-N24",
  "PASCHIM BARDHAMAN": "WB-PBA",
  "MIDNAPORE(PASCHIM)": "WB-PME",
  "PURBA BARDHAMAN": "WB-PUB",
  "MIDNAPORE(PURBA)": "WB-PMD",
  "PURULIA": "WB-PUR",
  "24 PARGANAS(S)": "WB-S24",
  "UTTAR DINAJPUR": "WB-UDJ",
};

/** Printed on every page of the source. Not inferred. */
const DESIGNATION = "Non-official Marriage Officer / Hindu Marriage Registrar";

/**
 * Stable identifier derived from the record's own content, so a re-import
 * after the department republishes updates the same row instead of creating a
 * duplicate — and does not shift if an officer is inserted mid-list.
 */
function officeCode(districtCode, r) {
  const digest = createHash("sha256")
    .update(`${districtCode}|${r.officer_name}|${r.pincode ?? ""}|${r.address}`)
    .digest("hex").slice(0, 6).toUpperCase();
  return `${districtCode}-MO-${digest}`;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  console.error("Do not paste the service role key into a chat or commit it.");
  process.exit(1);
}

const records = JSON.parse(readFileSync(process.argv[2] ?? "/tmp/officers.json", "utf8"));
const supabase = createClient(url, key, { auth: { persistSession: false } });

const unknown = [...new Set(records.map((r) => r.district_label))].filter((d) => !DISTRICT_CODES[d]);
if (unknown.length) {
  console.error("Unmapped district labels — refusing to guess:", unknown);
  process.exit(1);
}

let inserted = 0, areas = 0;
for (const r of records) {
  const districtCode = DISTRICT_CODES[r.district_label];
  const code = officeCode(districtCode, r);

  const { data: office, error } = await supabase
    .from("offices")
    .upsert({
      office_code: code,
      // The source names the officer, not the office. Using the officer's name
      // as the label keeps the record honest; inventing "Office of the Marriage
      // Officer, <place>" would put words in the department's mouth.
      name: r.officer_name,
      officer_name: r.officer_name,
      designation: DESIGNATION,
      district_code: districtCode,
      address: r.address,
      pincode: r.pincode,
      phone: r.phones[0] ?? null,
      phones: r.phones,
      working_hours: r.working_hours,
      // acts is left empty on purpose: the source does not state which Acts an
      // officer is empowered under. Staff set this during verification.
      acts: [],
      verification_status: "PENDING_REVIEW",
      source_document: r.source_document,
      source_page: r.source_page,
      source_generated_on: r.source_generated_on,
      is_functional: true,
    }, { onConflict: "office_code" })
    .select("id")
    .single();

  if (error) { console.error(`FAILED ${code} (${r.officer_name}):`, error.message); process.exit(1); }
  inserted++;

  await supabase.from("office_jurisdictions").delete().eq("office_id", office.id);
  if (r.jurisdiction_areas.length) {
    const rows = r.jurisdiction_areas.map((a) => ({
      office_id: office.id, area_name: a.name, area_type: a.type, raw_label: a.raw,
    }));
    const { error: jErr } = await supabase.from("office_jurisdictions").insert(rows);
    if (jErr) { console.error(`FAILED jurisdictions for ${code}:`, jErr.message); process.exit(1); }
    areas += rows.length;
  }
  if (inserted % 50 === 0) console.error(`  ${inserted}/${records.length}`);
}

console.error(`\nimported ${inserted} officers, ${areas} jurisdiction areas — all PENDING_REVIEW`);
console.error("Nothing is publicly visible until staff verify each entry.");
