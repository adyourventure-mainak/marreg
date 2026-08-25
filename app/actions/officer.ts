"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import type { ActionState } from "./applications";

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
  });

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    message: `Your objection against ${data} has been recorded and sent to the Marriage Officer handling it.`,
  };
}
