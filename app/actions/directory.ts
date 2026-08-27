"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";
import { ACT_CODES, type ActCode } from "../../lib/acts";
import type { ActionState } from "./applications";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

/**
 * Every action here reports the database's own message on failure rather than a
 * friendlier rewrite. The refusals are the interesting part of this screen —
 * "this district now has 34 entries awaiting review, not 33" is precisely what
 * the reviewer needs to read, and a generic "could not save" would hide it.
 */

function paths(locale: string, district?: string) {
  revalidatePath(`/${locale}/directory`);
  if (district) revalidatePath(`/${locale}/directory/${district}`);
}

/** Verify or reject one entry. */
export async function reviewOffice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const office = str(formData, "office_id");
  const status = str(formData, "status");
  const note = str(formData, "note");
  const locale = str(formData, "locale") ?? "en";
  const district = str(formData, "district") ?? undefined;

  if (!office || !status) return { ok: false, error: "Missing entry or decision." };
  if (status !== "VERIFIED" && status !== "REJECTED") {
    return { ok: false, error: "A review must record a decision: verified or rejected." };
  }
  if (status === "REJECTED" && !note) {
    return { ok: false, error: "Say why this entry is being rejected." };
  }

  const { error } = await supabase.rpc("review_office", {
    p_office: office,
    p_status: status,
    p_note: note,
  });
  if (error) return { ok: false, error: error.message };

  paths(locale, district);
  return { ok: true, message: status === "VERIFIED" ? "Entry verified and now public." : "Entry rejected." };
}

/**
 * Decide a whole district. The expected count is carried in the form from the
 * page the reviewer actually read, so the database can refuse if the district
 * has changed since — see the migration for why that check exists.
 */
export async function reviewDistrict(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const district = str(formData, "district");
  const status = str(formData, "status");
  const note = str(formData, "note");
  const expected = Number(str(formData, "expected_count"));
  const locale = str(formData, "locale") ?? "en";

  if (!district || !status) return { ok: false, error: "Missing district or decision." };
  if (!Number.isInteger(expected) || expected < 1) {
    return { ok: false, error: "The number of entries under review was not carried through. Reload the page." };
  }
  if (!note) return { ok: false, error: "Record what was checked against the source document." };

  const { data, error } = await supabase.rpc("review_offices_by_district", {
    p_district: district,
    p_status: status,
    p_expected_count: expected,
    p_note: note,
  });
  if (error) return { ok: false, error: error.message };

  paths(locale, district);
  const n = (data as { reviewed?: number } | null)?.reviewed ?? expected;
  return {
    ok: true,
    message: status === "VERIFIED"
      ? `${n} ${n === 1 ? "entry is" : "entries are"} now public.`
      : `${n} ${n === 1 ? "entry" : "entries"} rejected.`,
  };
}

/** Assign the Acts an officer is empowered under. The source PDFs do not state these. */
export async function setOfficeActs(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const office = str(formData, "office_id");
  const locale = str(formData, "locale") ?? "en";
  const district = str(formData, "district") ?? undefined;

  if (!office) return { ok: false, error: "Missing entry." };

  // Checkboxes: absent means unchecked. An empty selection is a real answer —
  // it is what the import leaves behind — so it is sent through as an empty
  // array rather than treated as "nothing to save".
  const acts = formData
    .getAll("acts")
    .filter((v): v is string => typeof v === "string")
    .filter((v): v is ActCode => (ACT_CODES as readonly string[]).includes(v));

  const { error } = await supabase.rpc("set_office_acts", {
    p_office: office,
    p_acts: acts,
    p_note: str(formData, "note"),
  });
  if (error) return { ok: false, error: error.message };

  paths(locale, district);
  return {
    ok: true,
    message: acts.length === 0 ? "Acts cleared." : `Acts saved: ${acts.length}.`,
  };
}
