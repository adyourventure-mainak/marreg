/**
 * Import the official Marriage Officer directory from a CSV file.
 *
 *   npx tsx scripts/import-offices.ts offices.csv
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment —
 * the service role key bypasses RLS, so keep it out of the repo and out of
 * anything shipped to the browser.
 *
 * Expected CSV header (extra columns are ignored):
 *   office_code,name,officer_name,designation,district_code,sub_division,
 *   police_station,address,pincode,phone,email,acts,is_functional
 *
 * `acts` is a semicolon-separated list, e.g.  HMA_1955;SMA_13;SMA_16
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [, , file] = process.argv;
if (!file) {
  console.error("Usage: npx tsx scripts/import-offices.ts <offices.csv>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.");
  process.exit(1);
}

/** Minimal CSV reader that understands quoted fields and embedded commas. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }

  const [header, ...body] = rows.filter((r) => r.some((v) => v.trim() !== ""));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const nullable = (v: string | undefined) => (v && v !== "" ? v : null);

async function main() {
  const records = parseCsv(readFileSync(file, "utf8"));
  const supabase = createClient(url!, key!, { auth: { persistSession: false } });

  const rows = records
    .filter((r) => r.office_code && r.name && r.district_code)
    .map((r) => ({
      office_code: r.office_code,
      name: r.name,
      officer_name: nullable(r.officer_name),
      designation: nullable(r.designation),
      district_code: r.district_code,
      sub_division: nullable(r.sub_division),
      police_station: nullable(r.police_station),
      address: r.address || r.name,
      pincode: nullable(r.pincode),
      phone: nullable(r.phone),
      email: nullable(r.email),
      acts: (r.acts ?? "").split(";").map((a) => a.trim()).filter(Boolean),
      is_functional: (r.is_functional ?? "true").toLowerCase() !== "false",
      source_url: nullable(r.source_url),
    }));

  console.log(`Importing ${rows.length} offices…`);

  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await supabase.from("offices").upsert(batch, { onConflict: "office_code" });
    if (error) {
      console.error(`Batch starting at ${i} failed:`, error.message);
      process.exit(1);
    }
    console.log(`  ${Math.min(i + 200, rows.length)}/${rows.length}`);
  }

  console.log("Done.");
}

main();
