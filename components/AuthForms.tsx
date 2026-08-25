"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, requestPasswordReset, updatePassword, type AuthState } from "../app/actions/auth";
import { Alert, Button, Field } from "./ui";

const initial: AuthState = { ok: false };

function Google({ next }: { next: string }) {
  return (
    <>
      <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
        <span className="h-px flex-1 bg-[var(--rule)]" /> or <span className="h-px flex-1 bg-[var(--rule)]" />
      </div>
      <form action="/api/auth/google" method="post">
        <input type="hidden" name="next" value={next} />
        <button className="focus flex min-h-12 w-full items-center justify-center gap-3 border border-rule bg-paper px-5 text-sm font-bold">
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
            <path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-4H24v7.5h12c-.2 2-1.5 5-4.4 7l6.7 5.2C42.2 36 45 30.6 45 24z"/>
            <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.9-12.5-9.2l-7.1 5.5C8.1 41 15.5 46 24 46z"/>
            <path fill="#FBBC05" d="M11.5 28.3c-.5-1.4-.7-2.8-.7-4.3s.3-3 .7-4.3l-7.1-5.5C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.8l7.1-5.5z"/>
            <path fill="#EA4335" d="M24 9.5c3.3 0 5.5 1.4 6.8 2.6l5.9-5.8C33 2.9 29.9 1 24 1 15.5 1 8.1 6 4.4 14.2l7.1 5.5C13.3 14.4 18.2 9.5 24 9.5z"/>
          </svg>
          Continue with Google
        </button>
      </form>
    </>
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
      <Google next={next} />
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
          <Google next="/en/account" />
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
