"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";

export type AuthState = { ok: boolean; error?: string; message?: string };

/**
 * The OTP forms carry the address between the two steps, so the verify step
 * knows which sign-in it is completing without trusting a hidden field alone.
 */
export type OtpState = AuthState & { sent?: boolean; email?: string };

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

/* ------------------------------------------------------------------ email OTP
 * A stand-in for the phone OTP the real service will use. Same shape — one
 * code, one short-lived attempt — so replacing the channel later touches the
 * transport and not the flow.
 *
 * NOTE: Supabase sends a magic *link* by default. The "Magic Link" email
 * template must include {{ .Token }} for a six-digit code to arrive at all;
 * without that change the address receives a link and this form has nothing
 * to type in. That is a dashboard setting, not something code can set.
 */
export async function requestEmailOtp(_prev: OtpState, formData: FormData): Promise<OtpState> {
  const supabase = await createClient();
  const email = str(formData, "email");
  const fullName = str(formData, "full_name");

  if (!email) return { ok: false, error: "Enter your email address." };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: fullName ? { full_name: fullName } : undefined,
    },
  });

  // Supabase applies its own per-address and per-hour limits to this endpoint;
  // surfacing its message is more accurate than inventing a second limiter.
  if (error) return { ok: false, error: error.message, email };

  return {
    ok: true,
    sent: true,
    email,
    message: `We have sent a six-digit code to ${email}. It expires in one hour.`,
  };
}

export async function verifyEmailOtp(_prev: OtpState, formData: FormData): Promise<OtpState> {
  const supabase = await createClient();
  const email = str(formData, "email");
  const token = str(formData, "token").replace(/\s+/g, "");
  const next = str(formData, "next") || "/en/account";

  if (!email) return { ok: false, error: "Start again and enter your email address." };
  if (!/^\d{6}$/.test(token)) {
    return { ok: false, sent: true, email, error: "Enter the six-digit code from the email." };
  }

  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ok: false, sent: true, email, error: error.message };

  revalidatePath("/", "layout");
  redirect(next);
}
