"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

/**
 * Role changes go through set_user_role rather than a direct update: profiles
 * is column-locked so that no one can move their own office, and the function
 * writes an audit entry for every change. It refuses self-changes, so an
 * administrator cannot quietly widen their own reach.
 */
export async function assignStaffRole(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const userId = str(formData, "user_id");
  const role = str(formData, "role");
  if (!userId || !role) return;

  const { error } = await supabase.rpc("set_user_role", {
    p_user: userId,
    p_role: role,
    p_office: str(formData, "office_id"),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/en/admin");
}

/** Authorise an address to hold a staff role before that person signs up. */
export async function inviteStaff(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const email = str(formData, "email");
  const role = str(formData, "role");
  if (!email || !role) return;

  const { error } = await supabase.rpc("invite_staff", {
    p_email: email,
    p_role: role,
    p_office: str(formData, "office_id"),
    p_note: str(formData, "note"),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/en/admin");
}

/** Withdraw an authorisation that has not been used yet. */
export async function revokeStaffInvitation(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const email = str(formData, "email");
  if (!email) return;

  const { error } = await supabase.rpc("revoke_staff_invitation", { p_email: email });
  if (error) throw new Error(error.message);

  revalidatePath("/en/admin");
}

/**
 * Verify or reject an extracted source document.
 *
 * The gate between a mechanical PDF extraction and something the citizen
 * assistant is allowed to quote. review_knowledge_source() checks is_staff()
 * and writes the audit entry, so this action only has to carry the form.
 */
export async function reviewKnowledgeSource(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const sourceId = str(formData, "source_id");
  const status = str(formData, "status");
  if (!sourceId || !status) return;

  const { error } = await supabase.rpc("review_knowledge_source", {
    p_source: sourceId,
    p_status: status,
    p_note: str(formData, "note"),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/en/admin/knowledge");
  revalidatePath("/bn/admin/knowledge");
}
