/**
 * Extract the West Bengal Marriage Officer directory from the district PDFs.
 *
 * Deterministic by construction: the PDFs draw every table cell as a real
 * rectangle, so each cell's text is exactly the text items whose coordinates
 * fall inside that rectangle. Nothing is inferred, and no language model is
 * involved — an AI reading of these pages could plausibly invent a phone
 * number or a police station, and this data must be exact.
 *
 * Output is JSON on stdout. It is NOT the source of truth and is not published:
 * every row lands in Supabase as PENDING_REVIEW for a human to verify.
 *
 *   node scripts/extract-officers.mjs "MO List District wise" > /tmp/officers.json
 */
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

const HEADERS = ["Name", "Office Address", "Contact Number", "Jurisdiction", "WORKING DAYS/HOURS"];

/** Cell rectangles drawn on a page, as [x, y, w, h]. */
async function rectangles(page) {
  const ops = await page.getOperatorList();
  const names = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));
  const out = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (names[ops.fnArray[i]] !== "constructPath") continue;
    const [fns, args] = ops.argsArray[i];
    let a = 0;
    for (const f of fns) {
      const kind = names[f];
      if (kind === "rectangle") { out.push(args.slice(a, a + 4).map(Number)); a += 4; }
      else if (kind === "moveTo" || kind === "lineTo") a += 2;
      else if (kind === "curveTo") a += 6;
      else if (kind === "closePath") { /* no args */ }
    }
  }
  return out;
}

const key = (r) => `${r[1].toFixed(1)}|${r[3].toFixed(1)}`;

/** Rows are the y/height bands that carry exactly the five table columns. */
function rowBands(rects) {
  const bands = new Map();
  for (const r of rects) {
    if (r[2] < 50 || r[2] > 160) continue;          // a data column is ~106pt wide
    const k = key(r);
    if (!bands.has(k)) bands.set(k, []);
    const cols = bands.get(k);
    if (!cols.some((c) => Math.abs(c[0] - r[0]) < 1)) cols.push(r);   // dedupe fill+stroke
  }
  return [...bands.values()]
    .filter((cols) => cols.length === 5)
    .map((cols) => cols.sort((a, b) => a[0] - b[0]))
    .sort((a, b) => b[0][1] - a[0][1]);              // top of page first
}

function cellText(items, rect) {
  const [x, y, w, h] = rect;
  const inside = items.filter((it) => {
    const ix = it.transform[4], iy = it.transform[5];
    // Half-open on the right: with a tolerance there, column 0 (ending at
    // 138.0) swallowed column 1's text (beginning at 139.9), which merged the
    // header into one cell and let the header row through as a record.
    return ix >= x - 1 && ix < x + w && iy >= y - 2 && iy <= y + h + 2;
  });
  inside.sort((a, b) => (Math.abs(a.transform[5] - b.transform[5]) > 2
    ? b.transform[5] - a.transform[5]
    : a.transform[4] - b.transform[4]));
  return inside.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
}

/** "SHANTI NAGAR, KALIMPONG, 734301, KALIMPONG" -> "734301" */
function pincodeOf(address) {
  const m = address.match(/\b([1-9]\d{5})\b/g);
  return m ? m[m.length - 1] : null;
}

/**
 * The Jurisdiction column is not a list of police stations. It carries typed
 * areas — 1,882 "X PS", plus Blocks, Municipalities and Sub Divisions across
 * the 23 districts — and every entry in the source carries its type. Flattening
 * them to "police stations" would misstate an officer's legal jurisdiction, so
 * the type is kept.
 */
const AREA_TYPES = [
  [/\s+Sub Division$/i, "SUB_DIVISION"],
  [/\s+Municipal Corporation$/i, "MUNICIPAL_CORPORATION"],
  [/\s+Municipality$/i, "MUNICIPALITY"],
  [/\s+Block$/i, "BLOCK"],
  [/\s+P\.?S\.?$/i, "POLICE_STATION"],
];

function jurisdictionAreas(jurisdiction) {
  return jurisdiction
    .split(",")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((entry) => {
      for (const [pattern, type] of AREA_TYPES) {
        if (pattern.test(entry)) {
          return { name: entry.replace(pattern, "").trim().toUpperCase(), type, raw: entry };
        }
      }
      // Untyped entries do not occur in the current source. Keep rather than
      // drop, and mark it, so a future export cannot silently lose coverage.
      return { name: entry.toUpperCase(), type: "UNSPECIFIED", raw: entry };
    })
    .filter((a) => a.name);
}

/**
 * The Contact Number column holds one or more numbers, comma separated —
 * often a landline and a mobile ("032-44205959,9434652738").
 */
function phoneNumbers(contact) {
  return contact.split(",").map((s) => s.trim()).filter(Boolean);
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "Monday (10:00 - 16:00), , Tuesday (10:00 - 16:00)" -> { Monday: "10:00-16:00", ... } */
function workingHours(text) {
  const out = {};
  for (const day of DAYS) {
    const m = text.match(new RegExp(`${day}\\s*\\((\\d{1,2}:\\d{2})\\s*-\\s*(\\d{1,2}:\\d{2})\\)`, "i"));
    if (m) out[day] = `${m[1]}-${m[2]}`;
  }
  return Object.keys(out).length ? out : null;
}

async function extractFile(path) {
  const bytes = new Uint8Array(readFileSync(path));
  const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const records = [];
  let district = null;
  let generatedOn = null;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const items = (await page.getTextContent()).items.filter((i) => i.str.trim());
    const flat = items.map((i) => i.str).join(" ");

    // Read the label off its own text item. Matching against the flattened
    // page text ran on into the next item ("PURULIA" + the "N" of "Name") and
    // stopped at the bracket in "MIDNAPORE(PURBA)".
    const dItem = items.find((i) => i.str.trim().startsWith("DISTRICT:"));
    if (dItem) district ??= dItem.str.trim().replace(/^DISTRICT:\s*/, "").trim();
    const g = flat.match(/Generated On\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (g) generatedOn ??= `${g[3]}-${g[2]}-${g[1]}`;

    for (const cols of rowBands(await rectangles(page))) {
      const cells = cols.map((c) => cellText(items, c));
      if (cells.every((c, i) => c.toLowerCase() === HEADERS[i].toLowerCase())) continue; // header
      const [name, address, contact, jurisdiction, hours] = cells;
      if (!name || !address) continue;
      if (HEADERS.includes(name)) {
        throw new Error(`Header row leaked into records in ${basename(path)} p${p}: ${JSON.stringify(cells)}`);
      }
      records.push({
        officer_name: name.replace(/\s+/g, " "),
        address,
        pincode: pincodeOf(address),
        phones: phoneNumbers(contact),
        jurisdiction_raw: jurisdiction || null,
        jurisdiction_areas: jurisdiction ? jurisdictionAreas(jurisdiction) : [],
        working_hours: workingHours(hours),
        source_document: basename(path),
        source_page: p,
      });
    }
  }
  return { district, generatedOn, pages: doc.numPages, records };
}

const dir = process.argv[2];
const outPath = process.argv[3];
if (!outPath) { console.error("usage: extract-officers.mjs <pdf-dir> <out.json>"); process.exit(1); }
const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
const all = [];
const summary = [];
for (const f of files) {
  const { district, generatedOn, pages, records } = await extractFile(join(dir, f));
  for (const r of records) { r.district_label = district; r.source_generated_on = generatedOn; }
  all.push(...records);
  summary.push({ file: f, district, generatedOn, pages, records: records.length });
}
console.error(JSON.stringify(summary, null, 2));
console.error(`TOTAL RECORDS: ${all.length}`);
writeFileSync(outPath, JSON.stringify(all, null, 2));
console.error(`written: ${outPath}`);
