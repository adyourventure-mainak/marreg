import { ExtractedSchema, type Extracted } from "./types";
import { DOCUMENT_LABELS } from "../types";
import type { DocumentType } from "../types";

/**
 * Vision model adapter.
 *
 * Written against the OpenAI-compatible /chat/completions shape so the
 * provider can be swapped by changing AI_BASE_URL and AI_MODEL — nothing else
 * in the pipeline knows which model ran.
 *
 * A cheap, fast tier is the right choice here: this is transcription at
 * volume, not reasoning.
 */

export const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
export const AI_MODEL = process.env.AI_MODEL ?? "gpt-4o-mini";
const AI_API_KEY = process.env.AI_API_KEY ?? "";

export const aiConfigured = Boolean(AI_API_KEY);

const SYSTEM = `You transcribe Indian identity and civil documents for a marriage registration office in West Bengal.

Report only what the document actually shows. Never infer, correct, complete, or translate a value that is not printed. If a field is absent or unreadable, return null for it — a null is useful, a guess is harmful.

Rules:
- name_as_printed: copy the name exactly as printed, including spelling and word order. Do not normalise "Chattopadhyay" to "Chatterjee" or expand initials.
- date_of_birth: only if a date of birth is printed. Format yyyy-mm-dd.
- id_number_last4: the last FOUR characters of any identity number, and nothing more. Never return a full Aadhaar, PAN, passport or voter number.
- legibility: your honest read of how clearly this scan can be read, 0 to 1.
- warnings: short factual observations about the image — glare, crop, blur, obscured text. Not opinions about the application.

You are not deciding whether this document is acceptable. You are only reading it.`;

export type ExtractInput = {
  bytes: Uint8Array;
  mimeType: string;
  documentType: DocumentType;
  signal?: AbortSignal;
};

function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** JSON Schema mirroring ExtractedSchema, for structured output. */
const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "extracted_document",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "document_type_guess", "name_as_printed", "date_of_birth", "address",
        "id_number_last4", "issuing_authority", "legibility", "warnings",
      ],
      properties: {
        document_type_guess: { type: ["string", "null"] },
        name_as_printed: { type: ["string", "null"] },
        date_of_birth: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
        id_number_last4: { type: ["string", "null"] },
        issuing_authority: { type: ["string", "null"] },
        legibility: { type: "number" },
        warnings: { type: "array", items: { type: "string" } },
      },
    },
  },
};

export async function extractWithModel(input: ExtractInput): Promise<Extracted> {
  if (!aiConfigured) throw new Error("AI_API_KEY is not set");

  const label = DOCUMENT_LABELS[input.documentType] ?? input.documentType;

  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: "POST",
    signal: input.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      response_format: RESPONSE_FORMAT,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: `This was uploaded as: ${label}. Transcribe it.` },
            { type: "image_url", image_url: { url: toDataUrl(input.bytes, input.mimeType) } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Extraction provider returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Extraction provider returned no content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Extraction provider returned content that is not JSON");
  }

  // Validate rather than trust — a model that drifts from the schema should
  // fail the job loudly, not write a malformed row.
  return ExtractedSchema.parse(parsed);
}
