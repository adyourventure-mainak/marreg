import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";
const doc = await getDocument({ data: new Uint8Array(readFileSync(process.argv[2])), useSystemFonts: true }).promise;
const page = await doc.getPage(Number(process.argv[3] ?? 1));
const ops = await page.getOperatorList();
const names = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));
const counts = {};
const rects = [];
for (let i = 0; i < ops.fnArray.length; i++) {
  const fn = names[ops.fnArray[i]];
  counts[fn] = (counts[fn] ?? 0) + 1;
  if (fn === "constructPath") {
    const [fns, args] = ops.argsArray[i];
    let a = 0;
    for (const f of fns) {
      if (names[f] === "rectangle") { rects.push(args.slice(a, a + 4).map((n) => +n.toFixed(1))); a += 4; }
      else if (names[f] === "moveTo" || names[f] === "lineTo") a += 2;
      else if (names[f] === "curveTo") a += 6;
    }
  }
}
console.log("op counts:", JSON.stringify(counts));
console.log("rectangles (x,y,w,h):", rects.length);
for (const r of rects.slice(0, 25)) console.log("  ", r.join(", "));
