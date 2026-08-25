"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

/** Only RGM_ADMIN / DISTRICT_REGISTRAR can reach this — enforced by the profiles_admin_all policy. */
export async function assignStaffRole(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const userId = str(formData, "user_id");
  const role = str(formData, "role");
  if (!userId || !role) return;

  await supabase
    .from("profiles")
    .update({ role, office_id: str(formData, "office_id") })
    .eq("id", userId);

  revalidatePath("/en/admin");
}
