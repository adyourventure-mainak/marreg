import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "../../../components/Shell";
import { Card, Empty, StatusBadge } from "../../../components/ui";
import { createClient, getProfile } from "../../../lib/supabase/server";
import { ACTS } from "../../../lib/acts";
import { formatDate } from "../../../lib/format";
import { STATUS_LABELS, type Application, type Profile } from "../../../lib/types";

export const dynamic = "force-dynamic";

const QUEUES: { key: string; label: string; statuses: Application["status"][] }[] = [
  { key: "new", label: "New", statuses: ["SUBMITTED"] },
  { key: "scrutiny", label: "Under scrutiny", statuses: ["UNDER_SCRUTINY", "AWAITING_APPLICANT_FIX"] },
  { key: "notice", label: "Notice & objections", statuses: ["NOTICE_PUBLISHED", "OBJECTION_UNDER_ENQUIRY"] },
  { key: "register", label: "To register", statuses: ["AWAITING_REGISTRATION"] },
  { key: "done", label: "Completed", statuses: ["REGISTERED", "CERTIFICATE_ISSUED", "CANCELLED", "LAPSED"] },
];

export default async function OfficerPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ queue?: string }>;
}) {
  const { locale } = await params;
  const { queue = "new" } = await searchParams;

  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/officer`);
  if (profile.role === "APPLICANT") {
    return (
      <Page locale={locale} eyebrow="Officer desk" title="This area is for registry staff." lede="Your account does not have a registry role.">
        <Empty title="No access" body="If you are a Marriage Officer, ask the RGM administrator to assign your role and office." action={{ href: `/${locale}`, label: "Back to the portal" }} />
      </Page>
    );
  }

  const active = QUEUES.find((q) => q.key === queue) ?? QUEUES[0];
  const supabase = await createClient();

  const { data } = await supabase
    .from("applications")
    .select("*")
    .in("status", active.statuses)
    .order("submitted_at", { ascending: true });

  const applications = (data ?? []) as Application[];

  const { data: counts } = await supabase.from("applications").select("status");
  const countFor = (statuses: string[]) =>
    ((counts ?? []) as { status: string }[]).filter((c) => statuses.includes(c.status)).length;

  return (
    <Page
      locale={locale}
      eyebrow="Officer desk"
      title="Applications for your office."
      lede={`Signed in as ${profile.full_name ?? profile.email} · ${profile.role.replace(/_/g, " ").toLowerCase()}`}
    >
      <nav className="mt-10 flex flex-wrap gap-2">
        {QUEUES.map((q) => (
          <Link
            key={q.key}
            href={`/${locale}/officer?queue=${q.key}`}
            className={`focus border px-4 py-2 text-sm font-bold ${
              q.key === active.key ? "border-teal bg-teal text-white" : "border-rule text-[var(--muted)] hover:border-teal hover:text-teal"
            }`}
          >
            {q.label} <span className="ml-1 opacity-70">{countFor(q.statuses)}</span>
          </Link>
        ))}
      </nav>

      {applications.length === 0 ? (
        <Empty title={`Nothing in "${active.label}"`} body="When an application reaches this stage it will appear here." />
      ) : (
        <div className="mt-6 grid gap-3">
          {applications.map((a) => (
            <Card key={a.id} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <StatusBadge status={a.status} />
                <h2 className="mt-2 font-display text-2xl">{a.application_number ?? "Draft"}</h2>
                <p className="text-sm text-[var(--muted)]">
                  {ACTS[a.act_code].shortLabel} · submitted {formatDate(a.submitted_at)} · {STATUS_LABELS[a.status]}
                </p>
              </div>
              <Link href={`/${locale}/officer/${a.id}`} className="focus border border-teal px-5 py-3 text-sm font-bold text-teal">
                Open file
              </Link>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
