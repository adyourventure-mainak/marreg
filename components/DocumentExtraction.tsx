import { ExtractedSchema } from "../lib/extraction/types";
import { compareToParty, type Discrepancy } from "../lib/extraction/compare";
import type { ExtractionStatus, MarregDocument, Party } from "../lib/types";
import { formatDateTime } from "../lib/format";

/**
 * What the reader found on one document, shown to the Marriage Officer.
 *
 * Everything here is advisory and says so. The officer opens the scan and
 * decides; this panel exists to tell them where to look first, and to make it
 * obvious when nothing was checked at all — an unread document must never be
 * mistaken for a clean one.
 */

const STATUS_NOTE: Record<ExtractionStatus, string> = {
  QUEUED: "Queued for automated reading — not checked yet.",
  RUNNING: "Being read now — not checked yet.",
  DONE: "",
  FAILED: "Automated reading failed. Nothing was checked — review this document yourself.",
  SKIPPED: "Not machine-readable (PDFs and photographs are not read). Review this document yourself.",
};

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">{label}</dt>
      <dd className="text-sm leading-6">{value}</dd>
    </div>
  );
}

function DiscrepancyRow({ item }: { item: Discrepancy }) {
  const high = item.severity === "high";
  return (
    <li className={`border-l-4 px-3 py-2 ${high ? "border-[#b03a3a] bg-[#fbeaea]" : "border-[#c98a1e] bg-saffron-tint"}`}>
      <p className="text-xs font-bold leading-5">{item.message}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        Document: <strong className="text-ink">{item.onDocument}</strong>
        {" · "}
        Application: <strong className="text-ink">{item.onApplication}</strong>
      </p>
    </li>
  );
}

export function DocumentExtraction({ doc, party }: { doc: MarregDocument; party: Party | null }) {
  const status = doc.ai_status;
  if (!status) return null;

  if (status !== "DONE") {
    return (
      <p className="mt-3 border-t border-rule pt-3 text-xs leading-5 text-[var(--muted)]">
        {STATUS_NOTE[status]}
      </p>
    );
  }

  // The stored payload is redacted JSON written by the worker, so it is parsed
  // rather than trusted. A row that no longer fits the schema is reported as
  // unreadable instead of being rendered half-blank.
  const parsed = ExtractedSchema.safeParse(doc.ai_extracted);
  if (!parsed.success) {
    return (
      <p className="mt-3 border-t border-rule pt-3 text-xs leading-5 text-[var(--muted)]">
        An automated reading was recorded but cannot be displayed. Review this document yourself.
      </p>
    );
  }

  const extracted = parsed.data;
  const discrepancies = compareToParty(extracted, party);
  const legibility = doc.ai_legibility ?? extracted.legibility;
  const poor = legibility < 0.55;

  return (
    <div className="mt-3 border-t border-rule pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-teal">
          Automated reading · advisory only
        </h3>
        <span className="text-[10px] text-[var(--muted)]">
          {doc.ai_model ?? "unknown model"}
          {doc.ai_checked_at && ` · ${formatDateTime(doc.ai_checked_at)}`}
        </span>
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Row label="Name as printed" value={extracted.name_as_printed} />
        <Row label="Date of birth" value={extracted.date_of_birth} />
        <Row label="Issued by" value={extracted.issuing_authority} />
        <Row label="ID ending" value={extracted.id_number_last4} />
        <Row label="Appears to be" value={extracted.document_type_guess} />
        <Row label="Address" value={extracted.address} />
      </dl>

      <p className={`mt-3 text-xs leading-5 ${poor ? "font-bold text-[#8a2b2b]" : "text-[var(--muted)]"}`}>
        Legibility {Math.round(legibility * 100)}%
        {poor && " — the scan is hard to read, so the fields above may be wrong."}
      </p>

      {extracted.warnings.length > 0 && (
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)]">
          {extracted.warnings.map((w, i) => (
            <li key={`${w}-${i}`}>· {w}</li>
          ))}
        </ul>
      )}

      {discrepancies.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {discrepancies.map((d, i) => (
            <DiscrepancyRow key={`${d.code}-${i}`} item={d} />
          ))}
        </ul>
      )}

      {discrepancies.length === 0 && party && (
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          Agrees with the details entered for {party.name_english}.
        </p>
      )}

      {!party && (
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          Not attributed to an applicant, so nothing was compared against the application.
        </p>
      )}

      <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">
        Read by software, not verified. Only you can verify or reject this document.
      </p>
    </div>
  );
}
