// Diagnostic only: dump text items with coordinates so the column geometry
// of the Marriage Officer PDFs can be read off rather than guessed.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";

const file = process.argv[2];
const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true }).promise;
console.log("pages:", doc.numPages);
const page = await doc.getPage(1);
const content = await page.getTextContent();
console.log("viewport:", JSON.stringify(page.getViewport({ scale: 1 }).viewBox));
for (const item of content.items) {
  if (!item.str.trim()) continue;
  const [, , , , x, y] = item.transform;
  console.log(`x=${x.toFixed(1)}\ty=${y.toFixed(1)}\t${JSON.stringify(item.str)}`);
}
