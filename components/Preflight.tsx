import Link from "next/link";
import type { Finding, PreflightReport, Severity } from "../lib/preflight";

const STEP_LABELS = ["Applicants", "Marriage & office", "Witnesses", "Documents", "Review"];

const SEVERITY_STYLE: Record<Severity, { box: string; chip: string; label: string }> = {
  critical: {
    box: "border-[#b03a3a] bg-[#fbeaea]",
    chip: "bg-[#b03a3a] text-white",
    label: "Will be sent back",
  },
  warning: {
    box: "border-[#c98a1e] bg-saffron-tint",
    chip: "bg-[#c98a1e] text-white",
    label: "Often causes delay",
  },
  note: {
    box: "border-teal bg-teal-tint",
    chip: "bg-teal text-white",
    label: "Worth knowing",
  },
};

function FindingRow({ finding, appId, locale }: { finding: Finding; appId: string; locale: string }) {
  const style = SEVERITY_STYLE[finding.severity];
  return (
    <li className={`border-l-4 px-4 py-3 ${style.box}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${style.chip}`}>
          {style.label}
        </span>
        {finding.step && (
          <Link
            href={`/${locale}/apply/${appId}?step=${finding.step}`}
            className="focus text-xs font-bold text-ink underline"
          >
            Fix in step {finding.step} · {STEP_LABELS[finding.step - 1]}
          </Link>
        )}
      </div>
      <p className="mt-2 text-sm font-bold leading-6">{finding.message}</p>
      {finding.fix && <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{finding.fix}</p>}
    </li>
  );
}

/**
 * Pre-flight results.
 *
 * Deliberately advisory: this never disables the submit button. It tells the
 * applicant what the office is likely to send back, and leaves the decision
 * with them.
 */
export function Preflight({
  report, appId, locale, actLabel,
}: {
  report: PreflightReport; appId: string; locale: string; actLabel: string;
}) {
  if (report.clean) {
    return (
      <section className="border-2 border-[#2f7458] bg-[#e7f3ec] p-6">
        <h2 className="font-display text-2xl text-[#1f5a41]">Pre-submission check passed</h2>
        <p className="mt-2 text-sm leading-6 text-[#1f5a41]">
          Nothing obvious is missing. The Marriage Officer still verifies every document
          themselves, and may ask for more.
        </p>
      </section>
    );
  }

  const { critical, warning, note } = report.counts;
  const parts = [
    critical > 0 && `${critical} that will be sent back`,
    warning > 0 && `${warning} that often ${warning === 1 ? "causes" : "cause"} delay`,
    note > 0 && `${note} worth knowing`,
  ].filter(Boolean) as string[];

  return (
    <section className="border border-rule bg-surface p-6">
      <h2 className="font-display text-2xl">Before you submit</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        We checked this application against the rules for the {actLabel} — {parts.join(", ")}.
        {critical > 0 && " Submitting without fixing these usually means a correction notice and a second wait."}
      </p>

      <ul className="mt-5 grid gap-3">
        {report.findings.map((f, i) => (
          <FindingRow key={`${f.code}-${i}`} finding={f} appId={appId} locale={locale} />
        ))}
      </ul>

      <p className="mt-5 border-t border-rule pt-4 text-xs leading-5 text-[var(--muted)]">
        These are automated checks to save you a round trip — they are not a decision.
        Only the Marriage Officer can accept or reject an application, and you may submit
        as it stands if you believe a check is wrong.
      </p>
    </section>
  );
}
