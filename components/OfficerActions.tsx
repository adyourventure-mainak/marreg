"use client";

import { useActionState } from "react";
import { transitionApplication } from "../app/actions/officer";
import type { ActionState } from "../app/actions/applications";
import { Alert, Button } from "./ui";
import type { ApplicationStatus } from "../lib/types";

const initial: ActionState = { ok: false };

/** Events the officer may fire from each status, with the wording they see. */
const AVAILABLE: Partial<Record<ApplicationStatus, { event: string; label: string; needsReason?: boolean; tone?: "primary" | "ghost" | "danger" }[]>> = {
  SUBMITTED: [{ event: "officerAssigned", label: "Take up for scrutiny" }],
  UNDER_SCRUTINY: [
    { event: "approveNotice", label: "Approve and publish notice" },
    { event: "sendBackForCorrection", label: "Send back for correction", needsReason: true, tone: "ghost" },
    { event: "reject", label: "Reject application", needsReason: true, tone: "danger" },
  ],
  AWAITING_APPLICANT_FIX: [{ event: "resubmit", label: "Return to scrutiny" }],
  NOTICE_PUBLISHED: [
    { event: "objectionWindowClosed", label: "Close objection period" },
    { event: "objectionFiled", label: "Record an objection", needsReason: true, tone: "ghost" },
  ],
  OBJECTION_UNDER_ENQUIRY: [
    { event: "objectionDismissed", label: "Dismiss objection", needsReason: true },
    { event: "objectionUpheld", label: "Uphold objection and cancel", needsReason: true, tone: "danger" },
  ],
  AWAITING_REGISTRATION: [
    { event: "registered", label: "Mark as registered" },
    { event: "deadlineLapsed", label: "Mark as lapsed", needsReason: true, tone: "danger" },
  ],
  REGISTERED: [{ event: "certificateIssued", label: "Issue certificate" }],
};

export function OfficerActions({ appId, status }: { appId: string; status: ApplicationStatus }) {
  const [state, action, pending] = useActionState(transitionApplication, initial);
  const options = AVAILABLE[status] ?? [];

  if (options.length === 0) {
    return <p className="mt-4 text-sm text-[var(--muted)]">No further action is available from this status.</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      {options.map((o) => (
        <form key={o.event} action={action} className="border border-rule bg-paper p-4">
          <input type="hidden" name="application_id" value={appId} />
          <input type="hidden" name="event" value={o.event} />
          {o.needsReason && (
            <label className="block text-sm font-bold">
              Reason / note to the applicant
              <textarea
                name="reason"
                required
                rows={2}
                className="focus mt-2 w-full border border-rule bg-surface p-3 text-sm font-normal"
                placeholder="Explain what the applicant must do, or the grounds for this decision."
              />
            </label>
          )}
          <div className={o.needsReason ? "mt-3" : ""}>
            <Button variant={o.tone ?? "primary"} disabled={pending}>
              {pending ? "Working…" : o.label}
            </Button>
          </div>
        </form>
      ))}
    </div>
  );
}
