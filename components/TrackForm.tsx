"use client";

import { useActionState } from "react";
import { trackApplication, type TrackState } from "../app/actions/applications";
import { Alert, Button, Field } from "./ui";
import { StatusBadge } from "./ui";
import { ACTS } from "../lib/acts";
import { formatDate, formatDateTime, daysUntil } from "../lib/format";
import { JOURNEY, STATUS_GUIDANCE, STATUS_LABELS, type ApplicationStatus } from "../lib/types";

const initial: TrackState = { ok: false };

export function TrackForm() {
  const [state, action, pending] = useActionState(trackApplication, initial);

  if (state.ok && state.result) {
    const r = state.result;
    const status = r.status as ApplicationStatus;
    const objectionDays = daysUntil(r.objection_window_ends_at);
    const stepIndex = JOURNEY.indexOf(status);

    return (
      <div className="mt-10 max-w-2xl border border-rule bg-surface p-7 shadow-[0_12px_28px_rgba(23,33,31,.08)]">
        <StatusBadge status={status} />
        <h2 className="mt-5 font-display text-4xl">{r.application_number}</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {ACTS[r.act_code]?.label} · last updated {formatDateTime(r.updated_at)}
        </p>

        <div className="my-8 border-l-2 border-saffron pl-5">
          <p className="text-xs font-bold uppercase tracking-widest text-teal">Current step</p>
          <p className="mt-2 text-xl font-bold">{STATUS_LABELS[status]}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{STATUS_GUIDANCE[status]}</p>
          {r.officer_note && (
            <p className="mt-3 border border-rule bg-paper p-3 text-sm leading-6">
              <strong>Note from the office:</strong> {r.officer_note}
            </p>
          )}
        </div>

        {stepIndex >= 0 && (
          <ol className="mb-8 grid gap-2">
            {JOURNEY.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    i < stepIndex ? "bg-teal text-white" : i === stepIndex ? "bg-saffron text-ink" : "border border-rule text-[var(--muted)]"
                  }`}
                >
                  {i < stepIndex ? "✓" : i + 1}
                </span>
                <span className={i <= stepIndex ? "font-bold" : "text-[var(--muted)]"}>{STATUS_LABELS[s]}</span>
              </li>
            ))}
          </ol>
        )}

        <dl className="grid gap-3 border-t border-rule pt-5 text-sm sm:grid-cols-2">
          <div><dt className="font-bold">Marriage Officer</dt><dd className="text-[var(--muted)]">{r.office_name ?? "—"}</dd></div>
          <div><dt className="font-bold">Submitted</dt><dd className="text-[var(--muted)]">{formatDate(r.submitted_at)}</dd></div>
          <div>
            <dt className="font-bold">Objection period ends</dt>
            <dd className="text-[var(--muted)]">
              {formatDate(r.objection_window_ends_at)}
              {objectionDays !== null && objectionDays > 0 ? ` · ${objectionDays} days left` : ""}
            </dd>
          </div>
          <div><dt className="font-bold">Registration deadline</dt><dd className="text-[var(--muted)]">{formatDate(r.registration_deadline_at)}</dd></div>
        </dl>

        <form action={action} className="mt-7 border-t border-rule pt-5">
          <button className="focus border-b-2 border-saffron pb-1 text-sm font-bold text-teal">Check another application</button>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-10 max-w-xl border border-rule bg-surface p-7 shadow-[0_12px_28px_rgba(23,33,31,.08)]">
      <form action={action} className="space-y-5">
        <Field
          label="Application number"
          name="application_number"
          required
          placeholder="MR-2026-000000"
          hint="Printed on your acknowledgement receipt."
        />
        <Field
          label="Date of birth of either applicant"
          name="date_of_birth"
          type="date"
          required
          hint="Used only to confirm that this application is yours."
        />
        {state.error && <Alert>{state.error}</Alert>}
        <Button disabled={pending}>{pending ? "Checking…" : "View application status"}</Button>
      </form>
    </div>
  );
}
