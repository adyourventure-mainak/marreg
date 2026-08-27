import { describe, it, expect } from "vitest";
import { sniffMime, inspectPdf, stripMetadata, inspectDocument } from "./documents";

const bytes = (...parts: Array<number[] | string | Uint8Array>): Uint8Array => {
  const flat: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") for (const c of p) flat.push(c.charCodeAt(0));
    else for (const v of p) flat.push(v);
  }
  return Uint8Array.from(flat);
};

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngChunk = (name: string, payload: number[] = []) =>
  bytes(be32(payload.length), name, payload, be32(0)); // CRC is not validated by the stripper

describe("sniffMime", () => {
  it("identifies each accepted format from its bytes", () => {
    expect(sniffMime(bytes(PNG_SIG))).toBe("image/png");
    expect(sniffMime(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(bytes("RIFF", le32(100), "WEBPVP8 "))).toBe("image/webp");
    expect(sniffMime(bytes("%PDF-1.7\n"))).toBe("application/pdf");
  });

  it("rejects a file whose name lies about its contents", () => {
    // What a renamed .exe or .html actually starts with.
    expect(sniffMime(bytes("MZ\x90\x00"))).toBeNull();
    expect(sniffMime(bytes("<html><script>"))).toBeNull();
  });

  it("rejects a polyglot that hides a real header behind padding", () => {
    expect(sniffMime(bytes("GIF89a", "%PDF-1.7"))).toBeNull();
  });

  it("does not mistake a bare RIFF container for WebP", () => {
    expect(sniffMime(bytes("RIFF", le32(100), "WAVEfmt "))).toBeNull();
  });
});

describe("inspectPdf", () => {
  it("flags the dangerous features", () => {
    expect(inspectPdf(bytes("%PDF-1.7 /JavaScript (app.alert)")).hazard).toMatch(/JavaScript/);
    expect(inspectPdf(bytes("%PDF-1.7 /Launch")).hazard).toMatch(/launch/);
    expect(inspectPdf(bytes("%PDF-1.7 /EmbeddedFile")).hazard).toMatch(/embedded/);
    expect(inspectPdf(bytes("%PDF-1.7 /Encrypt 5 0 R")).hazard).toMatch(/password/);
  });

  it("leaves an ordinary scan alone", () => {
    const pdf = bytes("%PDF-1.7\n1 0 obj<</Type /Page >>endobj\n/OpenAction 2 0 R\n");
    // /OpenAction is deliberately not a hazard: it appears in ordinary scans.
    expect(inspectPdf(pdf).hazard).toBeNull();
    expect(inspectPdf(pdf).pages).toBe(1);
  });

  it("reports zero pages rather than guessing when the page tree is compressed", () => {
    expect(inspectPdf(bytes("%PDF-1.7\n/Type /ObjStm\n")).pages).toBe(0);
  });
});

describe("stripMetadata", () => {
  it("removes the EXIF segment from a JPEG but keeps the image data", () => {
    // The length field counts itself plus the payload: 2 + 9.
    const exif = [0x00, 0x0b, ...[..."Exif\0\0GPS"].map((c) => c.charCodeAt(0))];
    const jpeg = bytes(
      [0xff, 0xd8],
      [0xff, 0xe1], exif,                    // APP1 / EXIF — must go
      [0xff, 0xe0, 0x00, 0x04, 0x01, 0x02],  // APP0 / JFIF — must stay
      [0xff, 0xda, 0x00, 0x02], [1, 2, 3, 4],// SOS + entropy data
    );
    const out = stripMetadata("image/jpeg", jpeg);
    expect(Buffer.from(out).includes("Exif")).toBe(false);
    expect(Array.from(out.subarray(0, 2))).toEqual([0xff, 0xd8]);
    expect(Array.from(out.subarray(-4))).toEqual([1, 2, 3, 4]);
  });

  it("removes eXIf and text chunks from a PNG and keeps IHDR and IDAT", () => {
    const png = bytes(
      PNG_SIG,
      pngChunk("IHDR", [1, 2, 3]),
      pngChunk("eXIf", [..."GPSHERE"].map((c) => c.charCodeAt(0))),
      pngChunk("tEXt", [..."Author"].map((c) => c.charCodeAt(0))),
      pngChunk("IDAT", [9, 9, 9]),
      pngChunk("IEND"),
    );
    const out = stripMetadata("image/png", png);
    const s = Buffer.from(out).toString("latin1");
    expect(s).not.toContain("GPSHERE");
    expect(s).not.toContain("Author");
    expect(s).toContain("IHDR");
    expect(s).toContain("IDAT");
    expect(s).toContain("IEND");
  });

  it("removes the EXIF chunk from a WebP and fixes the RIFF length", () => {
    const body = bytes(
      "VP8 ", le32(4), [1, 2, 3, 4],
      "EXIF", le32(6), [..."SECRET"].map((c) => c.charCodeAt(0)),
    );
    const webp = bytes("RIFF", le32(4 + body.length), "WEBP", body);
    const out = stripMetadata("image/webp", webp);
    expect(Buffer.from(out).includes("SECRET")).toBe(false);
    const declared = new DataView(out.buffer, out.byteOffset).getUint32(4, true);
    expect(declared).toBe(out.length - 8);
  });

  it("returns a truncated image untouched rather than corrupting it further", () => {
    const truncated = bytes(PNG_SIG, be32(9999), "IDAT", [1, 2]);
    expect(stripMetadata("image/png", truncated)).toEqual(truncated);
  });
});

describe("inspectDocument", () => {
  const png = bytes(PNG_SIG, pngChunk("IHDR", [1]), pngChunk("IEND"));

  it("accepts a real PNG and names the extension from the bytes", () => {
    const r = inspectDocument("PHOTO", png);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mime).toBe("image/png");
      expect(r.extension).toBe("png");
    }
  });

  it("refuses a PDF where a photograph is required", () => {
    const r = inspectDocument("PHOTO", bytes("%PDF-1.7\n"));
    expect(r.ok).toBe(false);
  });

  it("accepts a PDF for an ordinary supporting document", () => {
    expect(inspectDocument("AGE_PROOF", bytes("%PDF-1.7\n")).ok).toBe(true);
  });

  it("refuses an empty file and an oversized one", () => {
    expect(inspectDocument("AGE_PROOF", new Uint8Array(0)).ok).toBe(false);
    const huge = new Uint8Array(5 * 1024 * 1024 + 1);
    huge.set(PNG_SIG);
    expect(inspectDocument("PHOTO", huge).ok).toBe(false);
  });

  it("refuses a long PDF", () => {
    const long = bytes("%PDF-1.7\n", "/Type /Page ".repeat(21));
    expect(inspectDocument("AGE_PROOF", long).ok).toBe(false);
  });
});
