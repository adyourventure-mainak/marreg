/**
 * Ingest the Act PDFs into the citizen assistant's knowledge base.
 *
 *   node scripts/ingest-acts.mjs "Marriage acts"
 *   node scripts/ingest-acts.mjs "Marriage acts" --dry-run
 *
 * The PDFs supplied by the department carry a real text layer, so this reads
 * the text rather than running OCR over a rendering of it. Nothing is
 * paraphrased, summarised, or corrected: a chunk is a verbatim span of the
 * document plus the section heading printed above it.
 *
 * Everything lands as PENDING_REVIEW. A section is invisible to the public
 * until registry staff verify the source in the admin console — the same gate
 * the officer directory uses, for the same reason: a mechanical extraction is
 * evidence of what a document says, not proof of it.
 *
 * Re-running is safe. A source is matched on its filename, its chunks are
 * replaced, and its status is reset to PENDING_REVIEW so that reviewing the
 * old text never silently approves new text.
 */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

/**
 * Which Acts each document is authority for.
 *
 * Keyed by filename because that is what the department sent; an unlisted file
 * is skipped rather than guessed at. The Special Marriage Act, 1954 backs both
 * of the app's SMA codes — s.13 (marriage solemnised under the Act) and s.16
 * (registration of a marriage celebrated in another form).
 */
const DOCUMENTS = {
  "Hindu Marriage Act 1955.pdf": {
    acts: ["HMA_1955"],
    title: "The Hindu Marriage Act, 1955",
    citation: "The Hindu Marriage Act, 1955 (Act No. 25 of 1955)",
  },
  "special_marriage_act.pdf": {
    acts: ["SMA_13", "SMA_16"],
    title: "The Special Marriage Act, 1954",
    citation: "The Special Marriage Act, 1954 (Act No. 43 of 1954)",
  },
  "The_Indian_Christian_Marriage_Act_1872.PDF": {
    acts: ["ICMA_1872"],
    title: "The Indian Christian Marriage Act, 1872",
    citation: "The Indian Christian Marriage Act, 1872 (Act No. 15 of 1872)",
  },
  "TheParsiMarriage&DivorceAct1936.pdf": {
    acts: ["PMDA_1936"],
    title: "The Parsi Marriage and Divorce Act, 1936",
    citation: "The Parsi Marriage and Divorce Act, 1936 (Act No. 3 of 1936)",
  },
};

/**
 * A section opens with its number, its printed heading, and a dash.
 *
 * The dash matters: it is what separates the body of the Act from the
 * "ARRANGEMENT OF SECTIONS" table at the front, whose lines have the same
 * shape but end at the full stop. These documents use four different dashes
 * between them (— – ― and a plain hyphen), hence the character class.
 */
const SECTION = /^(\d+[A-Z]?)\.\s*(.{2,120}?)\s*\.\s*[—–―-]\s*/;

/** Chars per chunk. Long sections are split so no single chunk dominates a search result. */
const MAX_CHUNK = 3500;

async function pageLines(file) {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(file)),
    useSystemFonts: true,
  }).promise;

  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    let y = null;
    let line = "";
    const flush = () => {
      const t = line.replace(/\s+/g, " ").trim();
      // Drop the bare page number printed at the head of every page.
      if (t && !/^\d{1,3}$/.test(t)) out.push({ page: p, text: t });
      line = "";
    };
    for (const item of content.items) {
      const ny = item.transform[5];
      if (y !== null && Math.abs(ny - y) > 2) flush();
      line += item.str;
      y = ny;
    }
    flush();
  }
  return out;
}

/**
 * Split the document into one entry per section.
 *
 * Everything before the first section start is the front matter — cover page,
 * arrangement of sections, enacting formula. It is not quotable law, so it is
 * dropped rather than stored as an unlabelled chunk.
 */
function sections(lines) {
  const found = [];
  let current = null;

  for (const { page, text } of lines) {
    const m = SECTION.exec(text);
    if (m) {
      if (current) found.push(current);
      current = {
        heading: `Section ${m[1]}. ${m[2]}`,
        page,
        body: [text],
      };
    } else if (current) {
      current.body.push(text);
    }
  }
  if (current) found.push(current);

  return found.map((s) => ({ ...s, body: s.body.join("\n") }));
}

/** Split an over-long section on paragraph boundaries, never mid-sentence. */
function split(section) {
  if (section.body.length <= MAX_CHUNK) return [section];

  const parts = [];
  let buf = "";
  for (const para of section.body.split("\n")) {
    if (buf && buf.length + para.length + 1 > MAX_CHUNK) {
      parts.push(buf);
      buf = "";
    }
    buf = buf ? `${buf}\n${para}` : para;
  }
  if (buf) parts.push(buf);

  return parts.map((body, i) => ({
    ...section,
    body,
    heading: parts.length > 1 ? `${section.heading} (part ${i + 1} of ${parts.length})` : section.heading,
  }));
}

function client() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ingest(supabase, dir, name, dryRun) {
  const meta = DOCUMENTS[name];
  const lines = await pageLines(join(dir, name));
  const chunks = sections(lines).flatMap(split);

  console.log(`${name}: ${chunks.length} sections`);
  if (!chunks.length) {
    console.log("  no sections matched — leaving the existing rows untouched");
    return 0;
  }
  if (dryRun) {
    for (const c of chunks.slice(0, 5)) console.log(`  p${c.page} ${c.heading}`);
    return chunks.length;
  }

  const { data: source, error: srcErr } = await supabase
    .from("knowledge_sources")
    .upsert(
      {
        kind: "ACT",
        acts: meta.acts,
        title: meta.title,
        citation: meta.citation,
        source_document: name,
        // Re-extracted text has not been reviewed, whatever the old status was.
        verification_status: "PENDING_REVIEW",
        verified_by: null,
        verified_at: null,
        review_note: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_document" },
    )
    .select()
    .single();
  if (srcErr) throw new Error(`source upsert failed: ${srcErr.message}`);

  const { error: delErr } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("source_id", source.id);
  if (delErr) throw new Error(`chunk clear failed: ${delErr.message}`);

  const rows = chunks.map((c, i) => ({
    source_id: source.id,
    seq: i + 1,
    heading: c.heading,
    body: c.body,
    page: c.page,
  }));

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("knowledge_chunks").insert(rows.slice(i, i + 200));
    if (error) throw new Error(`chunk insert failed: ${error.message}`);
  }

  console.log(`  stored as PENDING_REVIEW — verify it in the admin console before it is answerable`);
  return rows.length;
}

const dir = process.argv[2] ?? "Marriage acts";
const dryRun = process.argv.includes("--dry-run");
const supabase = dryRun ? null : client();

let total = 0;
for (const name of readdirSync(dir)) {
  if (!DOCUMENTS[name]) {
    if (!name.startsWith(".")) console.log(`skipping ${name} — not a known Act document`);
    continue;
  }
  total += await ingest(supabase, dir, name, dryRun);
}
console.log(`\n${dryRun ? "would store" : "stored"} ${total} chunks`);
