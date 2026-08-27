import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABELS, STATUS_TONE, type ApplicationStatus } from "../lib/types";

const TONE_CLASS: Record<string, string> = {
  neutral: "bg-[var(--rule)] text-ink",
  progress: "bg-teal-tint text-teal",
  action: "bg-saffron-tint text-[#8a5a10]",
  good: "bg-[#dbeee3] text-[#1f5a41]",
  bad: "bg-[#f6dcdc] text-[#8a2b2b]",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${TONE_CLASS[STATUS_TONE[status]]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const style =
    tone === "success"
      ? "border-[#2f7458] bg-[#e7f3ec] text-[#1f5a41]"
      : tone === "info"
        ? "border-teal bg-teal-tint text-teal"
        : "border-[#b03a3a] bg-[#fbeaea] text-[#8a2b2b]";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`mt-5 border-l-4 px-4 py-3 text-sm leading-6 ${style}`}>
      {children}
    </p>
  );
}

export function Field({
  label, name, type = "text", required, defaultValue, placeholder, hint, children, className = "",
  inputMode, autoComplete, maxLength,
}: {
  label: string; name?: string; type?: string; required?: boolean;
  defaultValue?: string | number | null; placeholder?: string; hint?: string;
  children?: ReactNode; className?: string;
  /** Passed through for one-time codes: numeric keypad and OS autofill. */
  inputMode?: "numeric" | "tel" | "email" | "text";
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <label className={`block text-sm font-bold ${className}`}>
      {label}
      {required && <span className="ml-1 text-[var(--marreg-pink)]">*</span>}
      {children ?? (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue ?? undefined}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          maxLength={maxLength}
          className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-base font-normal"
        />
      )}
      {hint && <span className="mt-1 block text-xs font-normal leading-5 text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

export function Button({
  children, variant = "primary", type = "submit", ...rest
}: { children: ReactNode; variant?: "primary" | "ghost" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const style =
    variant === "primary"
      ? "bg-saffron text-ink hover:brightness-95"
      : variant === "danger"
        ? "border border-[#b03a3a] text-[#8a2b2b] hover:bg-[#fbeaea]"
        : "border border-teal text-teal hover:bg-teal-tint";
  return (
    <button type={type} {...rest} className={`focus inline-flex min-h-12 items-center justify-center px-5 text-sm font-bold disabled:opacity-50 ${style}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-rule bg-surface p-6 ${className}`}>{children}</div>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <Card className="mt-8 text-center">
      <h2 className="text-2xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">{body}</p>
      {action && (
        <Link href={action.href} className="focus mt-6 inline-block bg-saffron px-5 py-3 text-sm font-bold">
          {action.label}
        </Link>
      )}
    </Card>
  );
}
