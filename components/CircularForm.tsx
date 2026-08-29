"use client";
import { useActionState } from "react";
import { publishCircular } from "../app/actions/circulars";
import type { ActionState } from "../app/actions/applications";
import { Alert, Button, Field } from "./ui";
const initial: ActionState = { ok: false };
export function CircularForm() { const [state, action, pending] = useActionState(publishCircular, initial); return <form action={action} className="mt-6 max-w-xl space-y-4 border border-rule bg-surface p-6"><Field label="Circular title" name="title" required /><Field label="Circular date" name="circular_date" type="date" required /><Field label="PDF or document URL" name="file_url" type="url" required hint="Use the official HTTPS link to the circular document." />{state.error && <Alert>{state.error}</Alert>}{state.ok && <Alert tone="success">{state.message}</Alert>}<Button disabled={pending}>{pending ? "Publishing…" : "Publish circular"}</Button></form>; }
