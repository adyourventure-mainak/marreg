import Link from "next/link";

/**
 * The sections of the administration area. Rendered server-side with the
 * current section passed in, so the console needs no client JavaScript.
 */
const SECTIONS = [
  { key: "overview",     href: "",              label: "Overview" },
  { key: "staff",        href: "/staff",        label: "Staff & roles" },
  { key: "applications", href: "/applications", label: "Applications" },
  { key: "objections",   href: "/objections",   label: "Objections" },
  { key: "audit",        href: "/audit",        label: "Audit trail" },
] as const;

export type AdminSection = (typeof SECTIONS)[number]["key"];

export function AdminNav({ locale, current }: { locale: string; current: AdminSection }) {
  return (
    <nav className="mt-8 flex flex-wrap gap-1 border-b border-rule" aria-label="Administration sections">
      {SECTIONS.map((s) => {
        const active = s.key === current;
        return (
          <Link
            key={s.key}
            href={`/${locale}/admin${s.href}`}
            aria-current={active ? "page" : undefined}
            className={`focus -mb-px border-b-2 px-4 py-3 text-sm font-bold ${
              active
                ? "border-teal text-teal"
                : "border-transparent text-[var(--muted)] hover:text-teal"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
      <Link
        href={`/${locale}/directory`}
        className="focus -mb-px border-b-2 border-transparent px-4 py-3 text-sm font-bold text-[var(--muted)] hover:text-teal"
      >
        Officer directory →
      </Link>
    </nav>
  );
}
