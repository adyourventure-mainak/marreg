"use server";
import { createClient } from "../../lib/supabase/server";
import type { ActionState } from "./applications";

export async function submitTransfer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const applicationId = String(formData.get("application_id") ?? "");
  const officeId = String(formData.get("requested_office_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!user) return { ok: false, error: "Please sign in to request a transfer." };
  if (!applicationId || !officeId || reason.length < 10) return { ok: false, error: "Select an application, destination office, and provide at least 10 characters explaining the request." };
  const { error } = await supabase.from("mo_transfer_requests").insert({ application_id: applicationId, applicant_id: user.id, requested_office_id: officeId, reason });
  return error ? { ok: false, error: error.message } : { ok: true, message: "Your transfer request has been submitted to the registry." };
}
