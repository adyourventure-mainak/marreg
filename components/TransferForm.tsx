"use client";
import { useActionState } from "react";
import { submitTransfer } from "../app/actions/transfer-mo";
import { Alert, Button, Field } from "./ui";
import type { ActionState } from "../app/actions/applications";
const initial: ActionState = { ok: false };
export function TransferForm({ applications, offices }: { applications: { id: string; application_number: string }[]; offices: { id: string; name: string; district_code: string }[] }) {
  const [state, action, pending] = useActionState(submitTransfer, initial);
  if (state.ok) return <div className="mt-8 max-w-xl"><Alert tone="success">{state.message}</Alert></div>;
  return <form action={action} className="mt-8 max-w-xl space-y-5 border border-rule bg-surface p-7"><label className="block text-sm font-bold">Application<select name="application_id" required className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-sm"><option value="">Select application</option>{applications.map(a => <option key={a.id} value={a.id}>{a.application_number}</option>)}</select></label><label className="block text-sm font-bold">Requested Marriage Officer office<select name="requested_office_id" required className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-sm"><option value="">Select office</option>{offices.map(o => <option key={o.id} value={o.id}>{o.name} · {o.district_code}</option>)}</select></label><Field label="Reason for transfer" name="reason" required hint="Explain the reason for requesting the change." /><Field label="Additional details" name="details" />{state.error && <Alert>{state.error}</Alert>}<Button disabled={pending}>{pending ? "Submitting…" : "Submit request"}</Button></form>;
}
