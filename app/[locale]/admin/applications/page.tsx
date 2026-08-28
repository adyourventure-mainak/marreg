import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "../../../../components/Shell";
import { Card, StatusBadge } from "../../../../components/ui";
import { Empty } from "../../../../components/ui";
import { AdminNav } from "../../../../components/AdminNav";
import { createClient, getProfile } from "../../../../lib/supabase/server";
import { isAdmin, onDate } from "../../../../lib/admin";
import { ACTS, type ActCode } from "../../../../lib/acts";
import type { ApplicationStatus, Profile } from "../../../../lib/types";

export const dynamic = "force-dynamic";

const STATUSES: ApplicationStatus[] = [
  "DRAFT", "PAYMENT_PENDING", "SUBMITTED", "UNDER_SCRUTINY", "AWAITING_APPLICANT_FIX",
  "NOTICE_PUBLISHED", "OBJECTION_UNDER_ENQUIRY", "AWAITING_REGISTRATION", "REGISTERED",
  "CERTIFICATE_ISSUED", "CORRECTION_PENDING", "CANCELLED", "LAPSED",
];

type Row = {
  id: string; application_number: string | null; act_code: ActCode;
  status: ApplicationStatus; district_code: string | null;
  receipt_date: string | null; objection_window_ends_at: string | null;
  registration_deadline_at: string | null; created_at: string;
};

export default async function AdminApplicationsPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status = "" } = await searchParams;
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/admin/applications`);

  if (!isAdmin(profile)) {
    return (
      <Page locale={locale} eyebrow="Administration" title="Restricted area.">
        <Empty title="No access" body="Only the Registrar General's administrators may open this list."
               action={{ href: `/${locale}`, label: "Back to the portal" }} />
      </Page>
    );
  }

  const supabase = await createClient();
  let query = supabase
    .from("applications")
    .select("id, application_number, act_code, status, district_code, receipt_date, objection_window_ends_at, registration_deadline_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && STATUSES.includes(status as ApplicationStatus)) query = query.eq("status", status);

  const { data } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <Page
      locale={locale}
      eyebrow="Administration"
      title="Applications."
      lede="Every application in the registry, newest first. The officer's desk is where they are acted on; this is the register-wide view."
    >
      <AdminNav locale={locale} current="applications" />

      <form className="mt-8 flex flex-wrap items-end gap-3">
        <label className="text-sm font-bold">
          Status
          <select name="status" defaultValue={status}
                  className="focus mt-2 min-h-12 w-full min-w-56 border border-rule bg-paper px-3 text-sm font-normal">
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>
            ))}
          </select>
        </label>
        <button className="focus min-h-12 bg-saffron px-5 text-sm font-bold">Filter</button>
        {status && (
          <Link className="focus min-h-12 border border-rule px-5 py-3 text-sm font-bold"
                href={`/${locale}/admin/applications`}>Clear</Link>
        )}
      </form>

      <p className="mt-6 text-sm text-[var(--muted)]">
        {rows.length} application{rows.length === 1 ? "" : "s"}{rows.length === 200 ? " (showing the newest 200)" : ""}
      </p>

      {rows.length ? (
        <div className="mt-4 grid gap-3">
          {rows.map((a) => (
            <Card key={a.id}>
              <div className="grid gap-4 md:grid-cols-[1.2fr_1.4fr_1fr_auto] md:items-center">
                <div>
                  <p className="font-bold">{a.application_number ?? "Not yet numbered"}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {ACTS[a.act_code]?.shortLabel ?? a.act_code}
                    {a.district_code ? ` · ${a.district_code}` : ""}
                  </p>
                </div>
                <div className="text-sm text-[var(--muted)]">
                  <p>Received {onDate(a.receipt_date)}</p>
                  <p>
                    Objections close {onDate(a.objection_window_ends_at)} · deadline{" "}
                    {onDate(a.registration_deadline_at)}
                  </p>
                </div>
                <StatusBadge status={a.status} />
                <Link className="focus font-bold text-teal underline md:text-right"
                      href={`/${locale}/officer/${a.id}`}>Open →</Link>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-[var(--muted)]">
          No application matches that status.
        </p>
      )}
    </Page>
  );
}
