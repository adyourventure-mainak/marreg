import { NextResponse } from "next/server";
import { createServiceClient } from "../../../lib/supabase/service";
import { processExtractionBatch, type ExtractionDeps } from "../../../lib/extraction/pipeline";
import { extractWithModel, AI_MODEL, aiConfigured } from "../../../lib/extraction/provider";
import type { ClaimedJob } from "../../../lib/extraction/types";

/**
 * The extraction worker.
 *
 * Driven by Vercel Cron (see vercel.json). Claims a batch of queued documents,
 * runs each through the vision model, and writes the redacted result back.
 *
 * Everything it does is advisory — it cannot verify or reject a document. That
 * is enforced by the documents_verified_by_human constraint, not by this file.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Refuse rather than run open if the secret was never configured.
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function run(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  if (!aiConfigured) {
    return NextResponse.json({ error: "AI_API_KEY is not set" }, { status: 503 });
  }

  const url = new URL(req.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 5);
  // Keep operator mistakes and authenticated endpoint abuse from creating an
  // oversized model batch or exhausting the function timeout.
  const limit = Number.isFinite(requestedLimit) ? Math.min(10, Math.max(1, Math.floor(requestedLimit))) : 5;
  const supabase = createServiceClient();

  const deps: ExtractionDeps = {
    model: AI_MODEL,

    async claim(n, worker) {
      const { data, error } = await supabase.rpc("claim_extraction_jobs", {
        p_limit: n,
        p_worker: worker,
      });
      if (error) throw new Error(`claim failed: ${error.message}`);
      return (data ?? []) as ClaimedJob[];
    },

    async download(path) {
      const { data, error } = await supabase.storage.from("marreg-docs").download(path);
      if (error) throw new Error(`download failed: ${error.message}`);
      const buf = await data.arrayBuffer();
      return { bytes: new Uint8Array(buf), mimeType: data.type || "application/octet-stream" };
    },

    async extract({ bytes, mimeType, documentType }) {
      // Leave headroom inside maxDuration so a hung provider cannot eat the
      // whole invocation and strand the rest of the batch.
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 25_000);
      try {
        return await extractWithModel({ bytes, mimeType, documentType, signal: ac.signal });
      } finally {
        clearTimeout(timer);
      }
    },

    async complete(jobId, payload) {
      const { error } = await supabase.rpc("complete_extraction", {
        p_job: jobId,
        p_extracted: payload.extracted,
        p_findings: payload.findings,
        p_legibility: payload.legibility,
        p_model: payload.model,
      });
      if (error) throw new Error(`complete failed: ${error.message}`);
    },

    async fail(jobId, reason) {
      const { error } = await supabase.rpc("fail_extraction", { p_job: jobId, p_error: reason });
      if (error) throw new Error(`fail failed: ${error.message}`);
    },

    async skip(jobId, reason) {
      const { error } = await supabase.rpc("skip_extraction", { p_job: jobId, p_reason: reason });
      if (error) throw new Error(`skip failed: ${error.message}`);
    },
  };

  const summary = await processExtractionBatch(deps, { limit, worker: "vercel-cron" });
  return NextResponse.json(summary);
}

// Vercel Cron issues GET; POST is here for a manual run with the same secret.
export const GET = run;
export const POST = run;
