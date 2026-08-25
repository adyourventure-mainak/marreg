"use client";

import { useActionState } from "react";
import { fileObjection } from "../app/actions/officer";
import type { ActionState } from "../app/actions/applications";
import { Alert, Button, Field } from "./ui";

const initial: ActionState = { ok: false };

export function ObjectionForm() {
  const [state, action, pending] = useActionState(fileObjection, initial);

  if (state.ok) return <div className="mt-10 max-w-xl"><Alert tone="success">{state.message}</Alert></div>;

  return (
    <div className="mt-10 max-w-xl border border-rule bg-surface p-7">
      <form action={action} className="space-y-5">
        <Field label="Application number" name="application_number" required placeholder="MR-2026-000000" hint="Shown on the published notice." />
        <Field label="Your full name" name="objector_name" required />
        <Field label="Your contact (phone or email)" name="objector_contact" />
        <label className="block text-sm font-bold">
          Grounds for objection<span className="ml-1 text-[var(--marreg-pink)]">*</span>
          <textarea
            name="grounds"
            required
            rows={5}
            className="focus mt-2 w-full border border-rule bg-paper p-3 text-base font-normal"
            placeholder="Set out the legal ground on which you object to this marriage being registered."
          />
        </label>
        {state.error && <Alert>{state.error}</Alert>}
        <Button disabled={pending}>{pending ? "Submitting…" : "File objection"}</Button>
        <p className="text-xs leading-5 text-[var(--muted)]">
          Objections are examined by the Marriage Officer. Filing a false objection is an offence.
        </p>
      </form>
    </div>
  );
}
