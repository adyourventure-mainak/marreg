"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";

export async function rateOffice(formData: FormData) {
  const office = String(formData.get("office_id") ?? "");
  const rating = Number(formData.get("rating"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("rate_office", { p_office: office, p_rating: rating });
  if (error) throw new Error(error.message);
  revalidatePath("/en/offices");
  revalidatePath("/bn/offices");
}
