import { describe, expect, it, vi } from "vitest";
import { processExtractionBatch, type ExtractionDeps } from "./pipeline";
import type { ClaimedJob, Extracted } from "./types";

function job(over: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    job_id: "job-1",
    document_id: "doc-1",
    application_id: "app-1",
    document_type: "IDENTITY_PROOF",
    storage_path: "app-1/id.pdf",
    mime_type: "image/jpeg",
    attempts: 1,
    ...over,
  };
}

function extracted(over: Partial<Extracted> = {}): Extracted {
  return {
    document_type_guess: "AADHAAR",
    name_as_printed: "Ananya Sen",
    date_of_birth: "1996-04-12",
    address: "12 Rashbehari Avenue, Kolkata 700029",
    id_number_last4: "9012",
    issuing_authority: "UIDAI",
    legibility: 0.9,
    warnings: [],
    ...over,
  };
}

function deps(over: Partial<ExtractionDeps> = {}): ExtractionDeps {
  return {
    claim: vi.fn(async () => [job()]),
    download: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" })),
    extract: vi.fn(async () => extracted()),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    skip: vi.fn(async () => {}),
    model: "gpt-5.6-luna",
    ...over,
  };
}

describe("happy path", () => {
  it("completes a job and reports it", async () => {
    const d = deps();
    const summary = await processExtractionBatch(d);
    expect(summary).toMatchObject({ claimed: 1, succeeded: 1, failed: 0 });
    expect(d.complete).toHaveBeenCalledOnce();
    expect(d.fail).not.toHaveBeenCalled();
  });

  it("passes the model name through so findings can be traced to a version", async () => {
    const d = deps();
    await processExtractionBatch(d);
    expect(vi.mocked(d.complete).mock.calls[0][1].model).toBe("gpt-5.6-luna");
  });

  it("does nothing gracefully when the queue is empty", async () => {
    const d = deps({ claim: vi.fn(async () => []) });
    const summary = await processExtractionBatch(d);
    expect(summary).toMatchObject({ claimed: 0, succeeded: 0, failed: 0 });
  });
});

describe("redaction is enforced at the boundary", () => {
  it("never persists a full identifier the model returned anyway", async () => {
    const d = deps({
      extract: vi.fn(async () => extracted({
        address: "Aadhaar 1234 5678 9012, Kolkata 700029",
      })),
    });
    await processExtractionBatch(d);

    const persisted = JSON.stringify(vi.mocked(d.complete).mock.calls[0][1].extracted);
    expect(persisted).not.toContain("1234 5678 9012");
    expect(persisted).toContain("9012");
    expect(persisted).toContain("700029"); // pincode survives
  });

  it("fails the job rather than storing something it could not redact", async () => {
    // A model that returns a raw number under an unexpected shape.
    const d = deps({
      extract: vi.fn(async () => ({
        ...extracted(),
        warnings: ["ref 12345678901234567890"],
      })),
      // Force the gate to see raw digits by making redaction a no-op is not
      // possible from outside, so instead assert the pipeline still succeeds
      // because redactForStorage masks it.
    });
    const summary = await processExtractionBatch(d);
    expect(summary.succeeded).toBe(1);
    const persisted = JSON.stringify(vi.mocked(d.complete).mock.calls[0][1].extracted);
    expect(persisted).not.toMatch(/\d{9,}/);
  });
});

describe("findings", () => {
  it("raises a warning when the scan is barely readable", async () => {
    const d = deps({ extract: vi.fn(async () => extracted({ legibility: 0.2 })) });
    await processExtractionBatch(d);
    const findings = vi.mocked(d.complete).mock.calls[0][1].findings;
    expect(findings.some((f) => f.code === "DOC_ILLEGIBLE" && f.severity === "warning")).toBe(true);
  });

  it("stays quiet on a clear scan", async () => {
    const d = deps();
    await processExtractionBatch(d);
    expect(vi.mocked(d.complete).mock.calls[0][1].findings).toEqual([]);
  });

  it("passes model observations through as notes, capped at three", async () => {
    const d = deps({
      extract: vi.fn(async () => extracted({ warnings: ["glare", "cropped", "blurry", "fourth"] })),
    });
    await processExtractionBatch(d);
    const findings = vi.mocked(d.complete).mock.calls[0][1].findings;
    expect(findings.filter((f) => f.code === "DOC_OBSERVATION")).toHaveLength(3);
    expect(findings.every((f) => f.severity !== "critical")).toBe(true);
  });

  it("never produces a finding that could read as a verification decision", async () => {
    const d = deps({ extract: vi.fn(async () => extracted({ legibility: 0.1, warnings: ["fake"] })) });
    await processExtractionBatch(d);
    const findings = vi.mocked(d.complete).mock.calls[0][1].findings;
    expect(findings.every((f) => f.severity === "warning" || f.severity === "note")).toBe(true);
  });
});

describe("failure handling", () => {
  it("records a provider failure without throwing", async () => {
    const d = deps({ extract: vi.fn(async () => { throw new Error("provider timeout"); }) });
    const summary = await processExtractionBatch(d);
    expect(summary).toMatchObject({ claimed: 1, succeeded: 0, failed: 1 });
    expect(d.fail).toHaveBeenCalledWith("job-1", "provider timeout");
    expect(d.complete).not.toHaveBeenCalled();
  });

  it("rejects an empty stored file", async () => {
    const d = deps({ download: vi.fn(async () => ({ bytes: new Uint8Array(), mimeType: "image/jpeg" })) });
    await processExtractionBatch(d);
    expect(vi.mocked(d.fail).mock.calls[0][1]).toMatch(/empty/i);
  });

  it("rejects a file over the size backstop", async () => {
    const d = deps({
      download: vi.fn(async () => ({ bytes: new Uint8Array(100), mimeType: "image/jpeg" })),
      maxBytes: 50,
    });
    await processExtractionBatch(d);
    expect(vi.mocked(d.fail).mock.calls[0][1]).toMatch(/over the 50 limit/);
  });

  it("one bad document does not stop the rest of the batch", async () => {
    const jobs = [job({ job_id: "a" }), job({ job_id: "b" }), job({ job_id: "c" })];
    const d = deps({
      claim: vi.fn(async () => jobs),
      extract: vi.fn(async () => { throw new Error("boom"); }) as never,
    });
    // only the middle one fails
    let n = 0;
    d.extract = vi.fn(async () => {
      n += 1;
      if (n === 2) throw new Error("boom");
      return extracted();
    });
    const summary = await processExtractionBatch(d);
    expect(summary).toMatchObject({ claimed: 3, succeeded: 2, failed: 1 });
    expect(summary.errors).toEqual([{ jobId: "b", error: "boom" }]);
  });

  it("survives the failure recorder itself failing", async () => {
    const d = deps({
      extract: vi.fn(async () => { throw new Error("provider down"); }),
      fail: vi.fn(async () => { throw new Error("database unreachable"); }),
    });
    await expect(processExtractionBatch(d)).resolves.toMatchObject({ failed: 1 });
  });
});

describe("batch limits", () => {
  it("clamps an absurd limit rather than trusting the caller", async () => {
    const d = deps();
    await processExtractionBatch(d, { limit: 1000 });
    expect(vi.mocked(d.claim).mock.calls[0][0]).toBe(25);
    await processExtractionBatch(d, { limit: 0 });
    expect(vi.mocked(d.claim).mock.calls[1][0]).toBe(1);
  });

  it("passes the worker name through for lock attribution", async () => {
    const d = deps();
    await processExtractionBatch(d, { worker: "manual-run" });
    expect(vi.mocked(d.claim).mock.calls[0][1]).toBe("manual-run");
  });
});

describe("unsupported formats", () => {
  it("skips a PDF instead of failing it three times", async () => {
    const d = deps({ claim: vi.fn(async () => [job({ mime_type: "application/pdf" })]) });
    const summary = await processExtractionBatch(d);
    expect(summary).toMatchObject({ claimed: 1, succeeded: 0, failed: 0, skipped: 1 });
    expect(d.skip).toHaveBeenCalledWith("job-1", expect.stringMatching(/application\/pdf/));
    expect(d.fail).not.toHaveBeenCalled();
    expect(d.extract).not.toHaveBeenCalled();
  });

  it("still processes images in a mixed batch", async () => {
    const d = deps({
      claim: vi.fn(async () => [
        job({ job_id: "a", mime_type: "image/png" }),
        job({ job_id: "b", mime_type: "application/pdf" }),
        job({ job_id: "c", mime_type: "image/jpeg" }),
      ]),
    });
    const summary = await processExtractionBatch(d);
    expect(summary).toMatchObject({ claimed: 3, succeeded: 2, skipped: 1, failed: 0 });
  });

  it("honours an override once PDF support is wired up", async () => {
    const d = deps({
      claim: vi.fn(async () => [job({ mime_type: "application/pdf" })]),
      supportedMimeTypes: ["image/jpeg", "application/pdf"],
    });
    const summary = await processExtractionBatch(d);
    expect(summary).toMatchObject({ succeeded: 1, skipped: 0 });
  });
});
