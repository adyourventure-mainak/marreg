"use client";
import { useActionState } from "react";
import { updateTransferStatus } from "../app/actions/transfer-admin";
import type { ActionState } from "../app/actions/applications";
import { Alert, Button } from "./ui";
const initial: ActionState = { ok: false };
export function TransferDecision({ id, status }: { id: string; status: string }) { const [state, action, pending] = useActionState(updateTransferStatus, initial); return <form action={action} className="mt-4 flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={id} /><select name="status" defaultValue={status === "PENDING" ? "UNDER_REVIEW" : status} className="focus min-h-10 border border-rule bg-paper px-2 text-sm"><option value="UNDER_REVIEW">Under review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select><Button disabled={pending}>{pending ? "Saving…" : "Save decision"}</Button>{state.error && <Alert>{state.error}</Alert>}{state.ok && <span className="text-sm text-teal">Updated.</span>}</form>; }
