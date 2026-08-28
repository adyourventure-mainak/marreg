"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  signIn, signUp, requestPasswordReset, updatePassword,
  requestEmailOtp, verifyEmailOtp,
  type AuthState, type OtpState,
} from "../app/actions/auth";
import { Alert, Button, Field } from "./ui";

const initial: AuthState = { ok: false };

const otpInitial: OtpState = { ok: false };

/**
 * Sign in with a one-time code sent to an email address — no password.
 *
 * Stands in for the phone OTP the live service will use. The two steps are
 * separate actions rather than one stateful action so that a failed code entry
 * re-renders the code step with the address intact, instead of dropping the
 * citizen back to the beginning.
 */
export function EmailOtpForm({ next }: { next: string }) {
  const [request, requestAction, requesting] = useActionState(requestEmailOtp, otpInitial);
  const [verify, verifyAction, verifying] = useActionState(verifyEmailOtp, otpInitial);

  const email = verify.email || request.email || "";
  const atCodeStep = Boolean(request.sent || verify.sent);

  if (!atCodeStep) {
    return (
      <div className="mt-10 max-w-md border border-rule bg-surface p-7">
        <h2 className="text-2xl">Sign in with a code</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          We will email you a six-digit code. You do not need a password.
        </p>
        <form action={requestAction} className="mt-5 space-y-5">
          <Field label="Email address" name="email" type="email" required autoComplete="email" />
          {request.error && <Alert>{request.error}</Alert>}
          <Button disabled={requesting}>{requesting ? "Sending…" : "Email me a code"}</Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-10 max-w-md border border-rule bg-surface p-7">
      <h2 className="text-2xl">Enter your code</h2>
      {request.message && !verify.error && (
        <div className="mt-4"><Alert tone="success">{request.message}</Alert></div>
      )}
      <form action={verifyAction} className="mt-5 space-y-5">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={email} />
        <Field
          label="Six-digit code"
          name="token"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          maxLength={6}
          hint={`Sent to ${email}.`}
        />
        {verify.error && <Alert>{verify.error}</Alert>}
        <Button disabled={verifying}>{verifying ? "Checking…" : "Sign in"}</Button>
      </form>
      <form action={requestAction} className="mt-4">
        <input type="hidden" name="email" value={email} />
        <button className="focus text-sm font-bold text-teal underline" disabled={requesting}>
          {requesting ? "Sending…" : "Send another code"}
        </button>
      </form>
    </div>
  );
}

export function SignInForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <div className="mt-10 max-w-md border border-rule bg-surface p-7">
      {notice && <Alert tone="error">{notice}</Alert>}
      <form action={action} className="space-y-5">
        <input type="hidden" name="next" value={next} />
        <Field label="Email address" name="email" type="email" required />
        <Field label="Password" name="password" type="password" required />
        {state.error && <Alert>{state.error}</Alert>}
        <Button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="mt-6 text-sm text-[var(--muted)]">
        <Link className="focus font-bold text-teal underline" href="/en/forgot-password">Forgotten your password?</Link>
        <span className="mx-2">·</span>
        <Link className="focus font-bold text-teal underline" href="/en/signup">Create an account</Link>
      </p>
    </div>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  return (
    <div className="mt-10 max-w-md border border-rule bg-surface p-7">
      {state.ok ? (
        <Alert tone="success">{state.message}</Alert>
      ) : (
        <>
          <form action={action} className="space-y-5">
            <Field label="Full name" name="full_name" required hint="As it appears on your identity documents." />
            <Field label="Email address" name="email" type="email" required />
            <Field label="Password" name="password" type="password" required hint="At least 8 characters." />
            {state.error && <Alert>{state.error}</Alert>}
            <Button disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button>
          </form>
        </>
      )}
      <p className="mt-6 text-sm text-[var(--muted)]">
        Already registered? <Link className="focus font-bold text-teal underline" href="/en/login">Sign in</Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  return (
    <div className="mt-10 max-w-md border border-rule bg-surface p-7">
      <form action={action} className="space-y-5">
        <Field label="Email address" name="email" type="email" required />
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="success">{state.message}</Alert>}
        <Button disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>
      </form>
    </div>
  );
}

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <div className="mt-10 max-w-md border border-rule bg-surface p-7">
      <form action={action} className="space-y-5">
        <Field label="New password" name="password" type="password" required hint="At least 8 characters." />
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="success">{state.message}</Alert>}
        <Button disabled={pending}>{pending ? "Saving…" : "Update password"}</Button>
      </form>
    </div>
  );
}
