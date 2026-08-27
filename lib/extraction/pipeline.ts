import { DOCUMENT_LABELS } from "../types";
import { redactForStorage } from "./redact";
import { legibilityFindings, type ClaimedJob, type Extracted } from "./types";
import type { Finding } from "../preflight";

/**
 * Orchestration for one batch of extraction jobs.
 *
 * Every side effect is injected, so the whole flow — retries, redaction,
 * partial failure — is testable without a database, a storage bucket, or a
 * model. `app/api/extraction/route.ts` supplies the real implementations.
 */

export type ExtractionDeps = {
  claim(limit: number, worker: string): Promise<ClaimedJob[]>;
  download(storagePath: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
  extract(input: {
    bytes: Uint8Array; mimeType: string; documentType: ClaimedJob["document_type"];
  }): Promise<Extracted>;
  complete(jobId: string, payload: {
    extracted: unknown; findings: Finding[]; legibility: number; model: string;
  }): Promise<void>;
  fail(jobId: string, error: string): Promise<void>;
  /** Nothing wrong with the document, we just cannot read this format. */
  skip(jobId: string, reason: string): Promise<void>;
  model: string;
  /** Refuse anything larger; the upload cap is 5 MB, this is a backstop. */
  maxBytes?: number;
  /** Formats the vision model accepts. PDFs are skipped unless listed. */
  supportedMimeTypes?: string[];
};

export type BatchSummary = {
  claimed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: { jobId: string; error: string }[];
};

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Image formats a vision endpoint takes. PDFs are deliberately absent: they
 * need rasterising first, which is not wired up. Sending one anyway would
 * fail three times and land in FAILED, which reads to an officer as a problem
 * with the applicant's document rather than a gap in our pipeline.
 */
export const DEFAULT_SUPPORTED_MIME = ["image/jpeg", "image/png", "image/webp"];

function message(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function processExtractionBatch(
  deps: ExtractionDeps,
  opts: { limit?: number; worker?: string } = {},
): Promise<BatchSummary> {
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 25));
  const worker = opts.worker ?? "vercel-cron";
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;

  const supported = deps.supportedMimeTypes ?? DEFAULT_SUPPORTED_MIME;

  const jobs = await deps.claim(limit, worker);
  const summary: BatchSummary = {
    claimed: jobs.length, succeeded: 0, failed: 0, skipped: 0, errors: [],
  };

  // Sequential on purpose. These run behind a cron tick with no user waiting,
  // and a burst of parallel vision calls is the fastest way to get rate
  // limited — which would fail jobs that are otherwise fine.
  for (const job of jobs) {
    try {
      const { bytes, mimeType } = await deps.download(job.storage_path);
      const effectiveMime = job.mime_type ?? mimeType;

      if (!supported.includes(effectiveMime)) {
        await deps.skip(job.job_id, `${effectiveMime} cannot be read by the vision model`);
        summary.skipped += 1;
        continue;
      }

      if (bytes.byteLength === 0) throw new Error("Stored file is empty");
      if (bytes.byteLength > maxBytes) {
        throw new Error(`Stored file is ${bytes.byteLength} bytes, over the ${maxBytes} limit`);
      }

      const extracted = await deps.extract({
        bytes,
        mimeType: effectiveMime,
        documentType: job.document_type,
      });

      const label = DOCUMENT_LABELS[job.document_type] ?? job.document_type;
      const findings = legibilityFindings(extracted, label);

      // Redact before anything is persisted. Throws if an identifier survived,
      // which fails the job rather than writing it.
      const safe = redactForStorage(extracted);

      await deps.complete(job.job_id, {
        extracted: safe,
        findings,
        legibility: extracted.legibility,
        model: deps.model,
      });
      summary.succeeded += 1;
    } catch (err) {
      // One bad document must not take down the batch.
      const text = message(err);
      summary.failed += 1;
      summary.errors.push({ jobId: job.job_id, error: text });
      try {
        await deps.fail(job.job_id, text);
      } catch {
        // If even recording the failure fails, the 10-minute lock expiry will
        // return the job to the queue on its own.
      }
    }
  }

  return summary;
}
