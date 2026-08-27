"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import type { ActionState } from "./applications";
import { clientHash } from "../../lib/client-hash";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

/** Move an application along the workflow. The database enforces legality and writes the audit row. */
export async function transitionApplication(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const appId = str(formData, "application_id");
  const event = str(formData, "event");
  const reason = str(formData, "reason");

  if (!appId || !event) return { ok: false, error: "Missing application or action." };

  const { error } = await supabase.rpc("transition_application", {
    p_app: appId,
    p_event: event,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/en/officer/${appId}`);
  revalidatePath("/en/officer");
  return { ok: true, message: "Application updated." };
}

export async function reviewDocument(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const docId = str(formData, "document_id");
  const status = str(formData, "status");
  const appId = str(formData, "application_id");
  if (!docId || !status) return;

  await supabase.rpc("review_document", {
    p_doc: docId,
    p_status: status,
    p_reason: str(formData, "reason"),
  });
  revalidatePath(`/en/officer/${appId}`);
}

/** Public objection filing — anyone may object during the notice period.
 *  The lookup runs inside a SECURITY DEFINER function because RLS (rightly)
 *  hides `applications` from anonymous visitors. */
export async function fileObjection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const number = str(formData, "application_number");
  const name = str(formData, "objector_name");
  const grounds = str(formData, "grounds");

  if (!number || !name || !grounds) {
    return { ok: false, error: "Enter the application number, your name, and the grounds for your objection." };
  }

  const { data, error } = await supabase.rpc("file_objection", {
    p_number: number,
    p_name: name,
    p_contact: str(formData, "objector_contact"),
    p_grounds: grounds,
    p_client: clientHash(await headers()),
  });

  if (error) return { ok: false, error: error.message };

  // The function reports refusal by return value rather than by raising, so
  // that its attempt-log row survives; see the migration for why.
  const result = String(data ?? "");

  if (result === "THROTTLED") {
    return {
      ok: false,
      error:
        "Too many objection attempts from this connection. Try again later, or contact the Marriage Officer directly.",
    };
  }

  if (!result.startsWith("FILED:")) {
    // Deliberately the same message whether the number does not exist, is not
    // on notice, or has closed. Distinguishing them would let anyone walk the
    // sequential application numbers and learn who has applied.
    return {
      ok: false,
      error:
        "That application number is not open for objections. Check the number on the published notice.",
    };
  }

  return {
    ok: true,
    message: `Your objection against ${result.slice("FILED:".length)} has been recorded and sent to the Marriage Officer handling it.`,
  };
}
