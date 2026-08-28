import { redirect } from "next/navigation";
import { getProfile } from "./supabase/server";
import type { Profile } from "./types";

/**
 * The administration area is for the Registrar General's office. District
 * registrars keep their own desk and the directory review; they do not
 * provision logins or read the registry-wide audit, so the gate here is
 * narrower than is_admin() in the database.
 */
export const ADMIN_ROLES = ["RGM_ADMIN"];

export async function requireAdmin(locale: string, path: string) {
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/admin${path}`);
  return profile;
}

export const isAdmin = (profile: Profile | null) =>
  !!profile && ADMIN_ROLES.includes(profile.role);

export const roleLabel = (r: string) => r.replace(/_/g, " ").toLowerCase();

export const onDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const onDateTime = (d: string | null) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";
