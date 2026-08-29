"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";
import type { ActionState } from "./applications";
export async function publishCircular(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  const title = String(fd.get("title") ?? "").trim(); const date = String(fd.get("circular_date") ?? ""); const url = String(fd.get("file_url") ?? "").trim();
  if (!user) return { ok: false, error: "Sign in required." }; if (!title || !date || !/^https:\/\//i.test(url)) return { ok: false, error: "Enter a title, date, and secure HTTPS document URL." };
  const { error } = await supabase.from("circulars").insert({ title, circular_date: date, file_url: url, published: true, created_by: user.id });
  if (error) return { ok: false, error: error.message }; revalidatePath("/en"); revalidatePath("/bn"); revalidatePath("/en/circulars"); revalidatePath("/bn/circulars"); return { ok: true, message: "Circular published." };
}
