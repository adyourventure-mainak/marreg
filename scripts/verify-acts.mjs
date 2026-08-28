/**
 * Does the stored corpus faithfully represent the Act PDFs?
 *
 *   node scripts/verify-acts.mjs
 *
 * Requires pdfjs-dist v4 (the geometry API changed in 5/6) and
 * SUPABASE_SERVICE_ROLE_KEY in the environment.
 *
 * verify-officers.mjs does this for the register; nothing did it for the Acts.
 * Re-extracts each PDF's text layer and asks two questions of the VERIFIED
 * sources: is every stored chunk actually present in the PDF (nothing
 * invented), and is every section heading in the PDF present in the corpus
 * (nothing silently dropped).
 */
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const FILES = {
  "The Hindu Marriage Act, 1955 (Act No. 25 of 1955)": "Marriage acts/Hindu Marriage Act 1955.pdf",
  "The Special Marriage Act, 1954 (Act No. 43 of 1954)": "Marriage acts/special_marriage_act.pdf",
  "The Indian Christian Marriage Act, 1872 (Act No. 15 of 1872)": "Marriage acts/The_Indian_Christian_Marriage_Act_1872.PDF",
  "The Parsi Marriage and Divorce Act, 1936 (Act No. 3 of 1936)": "Marriage acts/TheParsiMarriage&DivorceAct1936.pdf",
};

const norm = (s) => s.replace(/\s+/g, " ").trim();
/**
 * Letters only, lowercased.
 *
 * Three things differ harmlessly between the stored chunk and a fresh read:
 * how text items are joined (spacing), dash and quote style, and footnote
 * reference digits, which the ingest strips and a raw read does not. Comparing
 * letters alone removes all three, so what is left is the question that
 * matters: does the prose that was stored actually occur in the PDF.
 *
 * The cost is that numbers are not compared. This check would not catch a
 * digit that changed, only invented or reordered prose.
 */
const canon = (s) => s.toLowerCase().replace(/[^a-z]/g, "");

async function pdfText(path) {
  const data = new Uint8Array(await readFile(path));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    out += content.items.map((i) => i.str).join(" ") + "\n";
  }
  return norm(out);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const get = async (q) => (await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json();

const sources = await get("knowledge_sources?select=id,citation,verification_status");
const chunks = await get("knowledge_chunks?select=source_id,seq,heading,body,page&limit=1000");

for (const [citation, file] of Object.entries(FILES)) {
  const src = sources.find((s) => s.citation === citation);
  const mine = chunks.filter((c) => c.source_id === src.id).sort((a, b) => a.seq - b.seq);
  const text = await pdfText(file);

  // 1. Nothing invented: every chunk body must appear in the PDF.
  const canonText = canon(text);
  let notFound = [];
  let partial = [];
  for (const c of mine) {
    const body = canon(c.body);
    if (canonText.includes(body)) continue;            // whole chunk present verbatim
    const probe = body.slice(0, 200);
    if (canonText.includes(probe)) partial.push(`seq ${c.seq} (${c.heading})`);
    else notFound.push(`seq ${c.seq} — ${c.heading}`);
  }

  // 2. Nothing dropped: find every "N. Title.—" heading the PDF declares.
  const declared = [...text.matchAll(/(?:^|\s)(\d{1,3}[A-Z]?)\.\s+([A-Z][^.]{4,110}?)\.\s*[—–-]/g)]
    .map((m) => m[1]);
  const seen = new Set(mine.map((c) => (c.heading.match(/Section (\d+[A-Z]?)\./) || [])[1]).filter(Boolean));
  const missing = [...new Set(declared)].filter((n) => !seen.has(n));

  // 3. How much of the PDF's text survived into the corpus.
  const stored = mine.reduce((n, c) => n + norm(c.body).length, 0);

  console.log(`\n=== ${citation}`);
  console.log(`  chunks: ${mine.length} | sections captured: ${seen.size} | PDF chars: ${text.length} | stored chars: ${stored} (${((stored / text.length) * 100).toFixed(1)}%)`);
  console.log(`  chunks present in PDF verbatim: ${mine.length - notFound.length - partial.length}/${mine.length}`);
  console.log(`  chunks whose opening matches but not the whole body: ${partial.length ? partial.join("; ") : "none"}`);
  console.log(`  chunk text NOT found in PDF (would be invention): ${notFound.length ? notFound.join("; ") : "none"}`);
  console.log(`  section headings in PDF but not in corpus: ${missing.length ? missing.join(", ") : "none"}`);
}
