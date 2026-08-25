"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";

export type AuthState = { ok: boolean; error?: string; message?: string };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

async function origin(): Promise<string> {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL ?? `https://${h.get("host") ?? "localhost:3000"}`;
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = str(formData, "email");
  const password = str(formData, "password");
  const fullName = str(formData, "full_name");

  if (!email || !password) return { ok: false, error: "Enter your email address and a password." };
  if (password.length < 8) return { ok: false, error: "Use a password of at least 8 characters." };

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${await origin()}/auth/callback?next=/en/account`,
    },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Check your email and open the confirmation link to activate your account." };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = str(formData, "email");
  const password = str(formData, "password");
  const next = str(formData, "next") || "/en/account";

  if (!email || !password) return { ok: false, error: "Enter your email address and password." };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const next = str(formData, "next") || "/en/account";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/en/login?error=${encodeURIComponent(error?.message ?? "google")}`);
  redirect(data.url);
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = str(formData, "email");
  if (!email) return { ok: false, error: "Enter your email address." };

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=/en/account/password`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "If that address has an account, a reset link is on its way." };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const password = str(formData, "password");
  if (password.length < 8) return { ok: false, error: "Use a password of at least 8 characters." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Password updated." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/en");
}
