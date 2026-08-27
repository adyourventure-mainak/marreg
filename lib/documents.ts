/**
 * Server-side document inspection.
 *
 * The browser's `file.type` is client-supplied and trivially spoofable, so it is
 * never trusted here: every check below runs against the actual bytes.
 */

export type SafeMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export const EXTENSION: Record<SafeMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const MAX_BYTES = 5 * 1024 * 1024;
/** A scanned certificate or decree; anything longer is almost certainly a mistake. */
const MAX_PDF_PAGES = 20;

/** Document types that must be an image — a PDF of a passport photo is not usable. */
const IMAGE_ONLY = new Set(["PHOTO", "SIGNATURE_LTI"]);

const startsWith = (b: Uint8Array, sig: number[], at = 0) =>
  sig.every((v, i) => b[at + i] === v);

const ascii = (b: Uint8Array, at: number, len: number) =>
  String.fromCharCode(...b.subarray(at, at + len));

/**
 * Identify a file from its leading bytes. Signatures are matched at offset 0
 * only: a file with padding before its header is a polyglot, not a document.
 */
export function sniffMime(bytes: Uint8Array): SafeMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP")
    return "image/webp";
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

/** Byte-level indexOf for an ASCII needle. */
function indexOfAscii(hay: Uint8Array, needle: string, from = 0): number {
  const n = needle.length;
  outer: for (let i = from; i <= hay.length - n; i++) {
    for (let j = 0; j < n; j++) if (hay[i + j] !== needle.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}

function countAscii(hay: Uint8Array, needle: string): number {
  let n = 0;
  for (let i = indexOfAscii(hay, needle); i !== -1; i = indexOfAscii(hay, needle, i + 1)) n++;
  return n;
}

/**
 * Features that make a PDF unsafe to hand to an officer, or unreadable.
 *
 * Only long, distinctive tokens are matched. Short ones such as `/JS` or `/AA`
 * produce false positives against compressed stream data, and a wrongly rejected
 * marriage certificate is a worse outcome than a demo that misses an exotic PDF.
 */
const PDF_HAZARDS: Array<[token: string, reason: string]> = [
  ["/JavaScript", "contains embedded JavaScript"],
  ["/Launch", "can launch an external program"],
  ["/EmbeddedFile", "has other files embedded inside it"],
  ["/RichMedia", "contains embedded media"],
  ["/XFA", "is an XFA form, which cannot be read reliably"],
  ["/Encrypt", "is password-protected or encrypted"],
];

export type PdfReport = { hazard: string | null; pages: number };

export function inspectPdf(bytes: Uint8Array): PdfReport {
  for (const [token, reason] of PDF_HAZARDS) {
    if (indexOfAscii(bytes, token) !== -1) return { hazard: reason, pages: 0 };
  }
  // A count of zero means the page tree sits inside a compressed object stream,
  // not that the file is empty — so callers must treat 0 as "unknown", never
  // as a reason to reject.
  return { hazard: null, pages: countAscii(bytes, "/Type /Page ") + countAscii(bytes, "/Type/Page ") };
}

/* ------------------------------------------------------------------ *
 * Metadata stripping.
 *
 * Each stripper removes whole container segments rather than re-encoding, so
 * the image itself is bit-for-bit unchanged and no image library is needed.
 * A scan of an ID card carries GPS coordinates and a device serial in EXIF;
 * those must not reach the officer's screen or the storage bucket.
 * ------------------------------------------------------------------ */

/** APP0 (JFIF) and APP14 (Adobe) affect decoding; APP2 carries the colour profile. */
const JPEG_KEEP_APP = new Set([0xe0, 0xe2, 0xee]);

function stripJpeg(b: Uint8Array): Uint8Array {
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1];
    // Start of scan: everything after this is entropy-coded image data.
    if (marker === 0xda) {
      out.push(...b.subarray(i));
      return Uint8Array.from(out);
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) break;
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const drop = (isApp && !JPEG_KEEP_APP.has(marker)) || marker === 0xfe; // 0xFE = comment
    if (!drop) out.push(...b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  // Anything we could not parse is returned untouched rather than corrupted.
  return b;
}

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(b: Uint8Array): Uint8Array {
  const out: number[] = [...b.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= b.length) {
    const len = new DataView(b.buffer, b.byteOffset + i, 4).getUint32(0);
    const name = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) return b;
    if (!PNG_DROP.has(name)) out.push(...b.subarray(i, end));
    i = end;
    if (name === "IEND") break;
  }
  return Uint8Array.from(out);
}

const WEBP_DROP = new Set(["EXIF", "XMP "]);

function stripWebp(b: Uint8Array): Uint8Array {
  const chunks: number[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const len = new DataView(b.buffer, b.byteOffset + i + 4, 4).getUint32(0, true);
    const padded = len + (len % 2); // RIFF chunks are padded to an even length
    const end = i + 8 + padded;
    if (end > b.length) return b;
    if (!WEBP_DROP.has(ascii(b, i, 4))) chunks.push(...b.subarray(i, end));
    i = end;
  }
  const out = new Uint8Array(12 + chunks.length);
  out.set(b.subarray(0, 12));
  out.set(Uint8Array.from(chunks), 12);
  // The RIFF size field counts everything after the first eight bytes.
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

export function stripMetadata(mime: SafeMime, bytes: Uint8Array): Uint8Array {
  if (mime === "image/jpeg") return stripJpeg(bytes);
  if (mime === "image/png") return stripPng(bytes);
  if (mime === "image/webp") return stripWebp(bytes);
  return bytes;
}

/* ------------------------------------------------------------------ */

export type InspectionResult =
  | { ok: true; mime: SafeMime; extension: string; bytes: Uint8Array }
  | { ok: false; error: string };

/**
 * The single entry point used by the upload action. Returns the bytes that
 * should actually be stored — never the bytes that were uploaded.
 */
export function inspectDocument(
  documentType: string,
  bytes: Uint8Array,
): InspectionResult {
  if (bytes.length === 0) return { ok: false, error: "That file is empty." };
  if (bytes.length > MAX_BYTES) return { ok: false, error: "Files must be 5 MB or smaller." };

  const mime = sniffMime(bytes);
  if (!mime) {
    return {
      ok: false,
      error:
        "That file is not a JPG, PNG, WebP, or PDF. Renaming a file does not change its format — please upload the original.",
    };
  }

  if (mime === "application/pdf" && IMAGE_ONLY.has(documentType)) {
    return { ok: false, error: "Upload this as a photograph (JPG, PNG, or WebP), not a PDF." };
  }

  if (mime === "application/pdf") {
    const report = inspectPdf(bytes);
    if (report.hazard) {
      return { ok: false, error: `This PDF ${report.hazard}. Please upload a plain scan or printout.` };
    }
    if (report.pages > MAX_PDF_PAGES) {
      return {
        ok: false,
        error: `This PDF has ${report.pages} pages. Upload only the pages that matter — ${MAX_PDF_PAGES} at most.`,
      };
    }
  }

  return { ok: true, mime, extension: EXTENSION[mime], bytes: stripMetadata(mime, bytes) };
}
