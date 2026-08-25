"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { ACTS, partyRoles, validateEligibility, type ActCode } from "../../lib/acts";
import type { DocumentType } from "../../lib/types";

export type ActionState = { ok: boolean; error?: string; message?: string };

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/en/login");
  return { supabase, user };
}

/** Step 0 — pick an Act and open a draft. */
export async function createApplication(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const act = str(formData, "act_code") as ActCode | null;
  if (!act || !(act in ACTS)) redirect("/en/apply?error=act");

  // "Apply to this office" from the directory arrives as a hidden office_id.
  const officeId = str(formData, "office_id");
  let districtCode: string | null = null;
  if (officeId) {
    const { data: office } = await supabase.from("offices").select("district_code").eq("id", officeId).maybeSingle();
    districtCode = office?.district_code ?? null;
  }

  const { data, error } = await supabase
    .from("applications")
    .insert({
      owner_id: user.id,
      act_code: act,
      status: "DRAFT",
      current_step: 1,
      office_id: officeId,
      district_code: districtCode,
    })
    .select("id")
    .single();

  if (error || !data) redirect(`/en/apply?error=${encodeURIComponent(error?.message ?? "create")}`);
  redirect(`/en/apply/${data.id}`);
}

/** Step 1 — the two applicants. */
export async function saveParties(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const appId = str(formData, "application_id");
  const act = str(formData, "act_code") as ActCode;
  if (!appId) return { ok: false, error: "Missing application." };

  const roles = partyRoles(act);
  const rows = roles.map((role, i) => ({
    application_id: appId,
    role,
    name_english: str(formData, `p${i}_name`) ?? "",
    name_bengali: str(formData, `p${i}_name_bn`),
    date_of_birth: str(formData, `p${i}_dob`),
    religion: str(formData, `p${i}_religion`),
    occupation: str(formData, `p${i}_occupation`),
    marital_status_prior: str(formData, `p${i}_marital`),
    father_name: str(formData, `p${i}_father`),
    mother_name: str(formData, `p${i}_mother`),
    address_line1: str(formData, `p${i}_address1`),
    address_line2: str(formData, `p${i}_address2`),
    city: str(formData, `p${i}_city`),
    district_code: str(formData, `p${i}_district`),
    pincode: str(formData, `p${i}_pincode`),
    contact_email: str(formData, `p${i}_email`),
    contact_mobile: str(formData, `p${i}_mobile`),
  }));

  for (const [i, row] of rows.entries()) {
    if (!row.name_english) return { ok: false, error: `Enter the full legal name of applicant ${i + 1}.` };
    if (!row.date_of_birth) return { ok: false, error: `Enter the date of birth of applicant ${i + 1}.` };
  }

  const errors = validateEligibility({ act, dobA: rows[0].date_of_birth, dobB: rows[1].date_of_birth });
  if (errors.length) return { ok: false, error: errors.join(" ") };

  const { error } = await supabase.from("parties").upsert(rows, { onConflict: "application_id,role" });
  if (error) return { ok: false, error: error.message };

  await supabase.from("applications").update({ current_step: 2 }).eq("id", appId);
  revalidatePath(`/en/apply/${appId}`);
  redirect(`/en/apply/${appId}?step=2`);
}

/** Step 2 — marriage details and the chosen office. */
export async function saveDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const appId = str(formData, "application_id");
  const act = str(formData, "act_code") as ActCode;
  if (!appId) return { ok: false, error: "Missing application." };

  const marriageDate = str(formData, "marriage_date");
  const officeId = str(formData, "office_id");

  if (!officeId) return { ok: false, error: "Choose a Marriage Officer for your application." };

  const errors = validateEligibility({ act, marriageDate });
  if (errors.length) return { ok: false, error: errors.join(" ") };

  const { data: office } = await supabase.from("offices").select("district_code, police_station").eq("id", officeId).single();

  const { error } = await supabase
    .from("applications")
    .update({
      marriage_date: marriageDate,
      marriage_place: str(formData, "marriage_place"),
      notice_receipt_date: ACTS[act].alreadySolemnised ? null : new Date().toISOString().slice(0, 10),
      office_id: officeId,
      district_code: office?.district_code ?? null,
      police_station: office?.police_station ?? null,
      current_step: 3,
    })
    .eq("id", appId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/en/apply/${appId}`);
  redirect(`/en/apply/${appId}?step=3`);
}

/** Step 3 — witnesses. */
export async function saveWitnesses(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const appId = str(formData, "application_id");
  if (!appId) return { ok: false, error: "Missing application." };

  const rows = [0, 1, 2]
    .map((i) => ({
      application_id: appId,
      sequence: i + 1,
      name: str(formData, `w${i}_name`) ?? "",
      address: str(formData, `w${i}_address`),
      id_type: str(formData, `w${i}_id_type`),
      id_last_four: str(formData, `w${i}_id_last4`),
      mobile: str(formData, `w${i}_mobile`),
    }))
    .filter((r) => r.name !== "");

  if (rows.length < 2) return { ok: false, error: "At least two witnesses are required." };

  await supabase.from("witnesses").delete().eq("application_id", appId);
  const { error } = await supabase.from("witnesses").insert(rows);
  if (error) return { ok: false, error: error.message };

  await supabase.from("applications").update({ current_step: 4 }).eq("id", appId);
  revalidatePath(`/en/apply/${appId}`);
  redirect(`/en/apply/${appId}?step=4`);
}

/** Step 4 — document upload. */
export async function uploadDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const appId = str(formData, "application_id");
  const type = str(formData, "type") as DocumentType | null;
  const file = formData.get("file");

  if (!appId || !type) return { ok: false, error: "Missing application or document type." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Files must be 5 MB or smaller." };

  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type)) return { ok: false, error: "Upload a JPG, PNG, WebP, or PDF file." };

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${appId}/${type}-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("marreg-docs")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { error } = await supabase.from("documents").insert({
    application_id: appId,
    type,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/en/apply/${appId}`);
  return { ok: true, message: `${file.name} uploaded.` };
}

export async function deleteDocument(formData: FormData): Promise<void> {
  const { supabase } = await requireUser();
  const id = str(formData, "document_id");
  const appId = str(formData, "application_id");
  if (!id) return;

  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", id).single();
  if (doc?.storage_path) await supabase.storage.from("marreg-docs").remove([doc.storage_path]);
  await supabase.from("documents").delete().eq("id", id);
  revalidatePath(`/en/apply/${appId}`);
}

/** Step 5 — submit. All the real gatekeeping lives in the database function. */
export async function submitApplication(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const appId = str(formData, "application_id");
  if (!appId) return { ok: false, error: "Missing application." };

  const { error } = await supabase.rpc("submit_application", { p_app: appId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/en/account");
  redirect(`/en/account/${appId}?submitted=1`);
}

export async function deleteDraft(formData: FormData): Promise<void> {
  const { supabase } = await requireUser();
  const id = str(formData, "application_id");
  if (id) await supabase.from("applications").delete().eq("id", id).eq("status", "DRAFT");
  revalidatePath("/en/account");
  redirect("/en/account");
}

/** Public status lookup — number + date of birth, no sign-in needed. */
export type TrackResult = {
  application_number: string;
  status: string;
  act_code: ActCode;
  submitted_at: string | null;
  objection_window_ends_at: string | null;
  registration_deadline_at: string | null;
  office_name: string | null;
  officer_note: string | null;
  updated_at: string;
};

export type TrackState = { ok: boolean; error?: string; result?: TrackResult };

export async function trackApplication(_prev: TrackState, formData: FormData): Promise<TrackState> {
  const supabase = await createClient();
  const number = str(formData, "application_number");
  const dob = str(formData, "date_of_birth");

  if (!number || !dob) return { ok: false, error: "Enter both the application number and the date of birth." };

  const { data, error } = await supabase.rpc("track_application", { p_number: number, p_dob: dob });
  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      ok: false,
      error: "No application matched those details. Check the application number and that the date of birth belongs to one of the applicants.",
    };
  }
  return { ok: true, result: row as TrackResult };
}
