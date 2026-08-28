"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { fileObjection } from "../app/actions/officer";
import type { ActionState } from "../app/actions/applications";
import { Alert, Button, Field } from "./ui";

const initial: ActionState = { ok: false };

export function ObjectionForm() {
  const [state, action, pending] = useActionState(fileObjection, initial);
  const t = useTranslations("Objections");

  if (state.ok) return <div className="mt-10 max-w-xl"><Alert tone="success">{state.message}</Alert></div>;

  return (
    <div className="mt-10 max-w-xl border border-rule bg-surface p-7">
      <form action={action} className="space-y-5">
        <Field label={t("applicationNumber")} name="application_number" required placeholder="MR-2026-000000" hint={t("applicationNumberHint")} />
        <Field label={t("objectorName")} name="objector_name" required />
        <Field label={t("objectorContact")} name="objector_contact" />
        <label className="block text-sm font-bold">
          {t("grounds")}<span className="ml-1 text-[var(--marreg-pink)]">*</span>
          <textarea
            name="grounds"
            required
            rows={5}
            className="focus mt-2 w-full border border-rule bg-paper p-3 text-base font-normal"
            placeholder={t("groundsPlaceholder")}
          />
        </label>
        {state.error && <Alert>{state.error}</Alert>}
        <Button disabled={pending}>{pending ? t("submitting") : t("submit")}</Button>
        <p className="text-xs leading-5 text-[var(--muted)]">
          {t("warning")}
        </p>
      </form>
    </div>
  );
}
