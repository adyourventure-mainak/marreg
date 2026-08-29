"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";
import type { ActionState } from "./applications";
export async function updateTransferStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const id = String(fd.get("id") ?? ""); const status = String(fd.get("status") ?? "");
  if (!id || !["UNDER_REVIEW", "APPROVED", "REJECTED"].includes(status)) return { ok: false, error: "Invalid transfer decision." };
  const { error } = await supabase.from("mo_transfer_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/en/admin/transfer-mo"); revalidatePath("/bn/admin/transfer-mo");
  return { ok: true, message: "Transfer request updated." };
}
