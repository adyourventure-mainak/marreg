import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../../../components/Shell";
import { Alert, Card, StatusBadge } from "../../../../components/ui";
import { createClient } from "../../../../lib/supabase/server";
import { ACTS } from "../../../../lib/acts";
import { formatDate, formatDateTime, daysUntil } from "../../../../lib/format";
import {
  DOCUMENT_LABELS, JOURNEY, STATUS_GUIDANCE, STATUS_LABELS,
  type Application, type MarregDocument, type Office, type Party, type Witness,
} from "../../../../lib/types";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { locale, id } = await params;
  const { submitted } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const app = data as Application;

  const [{ data: parties }, { data: witnesses }, { data: documents }, { data: office }, { data: audit }] = await Promise.all([
    supabase.from("parties").select("*").eq("application_id", id),
    supabase.from("witnesses").select("*").eq("application_id", id).order("sequence"),
    supabase.from("documents").select("*").eq("application_id", id).order("created_at"),
    app.office_id ? supabase.from("offices").select("*").eq("id", app.office_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("audit_events").select("*").eq("application_id", id).order("occurred_at", { ascending: false }).limit(20),
  ]);

  const stepIndex = JOURNEY.indexOf(app.status);
  const objectionDays = daysUntil(app.objection_window_ends_at);
  const theOffice = office as Office | null;

  return (
    <>
      <Header locale={locale} />
      <main className="page py-14 md:py-20">
        <Link href={`/${locale}/account`} className="focus text-sm font-bold text-teal">← All applications</Link>

        {submitted && (
          <Alert tone="success">
            Your application has been submitted. Keep the application number below — you will need it to track progress.
          </Alert>
        )}

        <div className="mt-6">
          <StatusBadge status={app.status} />
          <h1 className="mt-4 font-display text-5xl">{app.application_number ?? "Unsubmitted draft"}</h1>
          <p className="mt-2 text-lg text-[var(--muted)]">{ACTS[app.act_code].label}</p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div className="space-y-6">
            <Card>
              <p className="text-xs font-bold uppercase tracking-widest text-teal">What is happening now</p>
              <p className="mt-3 text-xl font-bold">{STATUS_LABELS[app.status]}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{STATUS_GUIDANCE[app.status]}</p>
              {app.officer_note && (
                <p className="mt-4 border-l-2 border-saffron bg-paper p-3 text-sm leading-6">
                  <strong>Note from the office:</strong> {app.officer_note}
                </p>
              )}
              {["DRAFT", "AWAITING_APPLICANT_FIX"].includes(app.status) && (
                <Link href={`/${locale}/apply/${app.id}`} className="focus mt-5 inline-block bg-saffron px-5 py-3 text-sm font-bold">
                  {app.status === "DRAFT" ? "Continue application" : "Make the correction"}
                </Link>
              )}
            </Card>

            {stepIndex >= 0 && (
              <Card>
                <h2 className="font-display text-2xl">Progress</h2>
                <ol className="mt-4 grid gap-3">
                  {JOURNEY.map((s, i) => (
                    <li key={s} className="flex items-center gap-3 text-sm">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        i < stepIndex ? "bg-teal text-white" : i === stepIndex ? "bg-saffron text-ink" : "border border-rule text-[var(--muted)]"
                      }`}>
                        {i < stepIndex ? "✓" : i + 1}
                      </span>
                      <span className={i <= stepIndex ? "font-bold" : "text-[var(--muted)]"}>{STATUS_LABELS[s]}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            <Card>
              <h2 className="font-display text-2xl">Applicants</h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                {(parties as Party[] | null)?.map((p) => (
                  <div key={p.id} className="border-l-2 border-saffron pl-4 text-sm leading-6">
                    <span className="text-xs font-bold uppercase tracking-widest text-teal">{p.role.toLowerCase()}</span>
                    <strong className="mt-1 block text-base">{p.name_english}</strong>
                    <span className="block text-[var(--muted)]">Born {formatDate(p.date_of_birth)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="font-display text-2xl">Documents</h2>
              <ul className="mt-4 grid gap-2 text-sm">
                {(documents as MarregDocument[] | null)?.map((d) => (
                  <li key={d.id} className="flex justify-between gap-4 border-b border-rule pb-2">
                    <span>{DOCUMENT_LABELS[d.type]} <span className="text-[var(--muted)]">· {d.file_name}</span></span>
                    <span className={`shrink-0 text-xs font-bold uppercase tracking-widest ${
                      d.status === "VERIFIED" ? "text-[#1f5a41]" : d.status === "REJECTED" ? "text-[#8a2b2b]" : "text-[var(--muted)]"
                    }`}>{d.status.toLowerCase()}</span>
                  </li>
                ))}
                {!documents?.length && <li className="text-[var(--muted)]">No documents uploaded.</li>}
              </ul>
            </Card>

            <Card>
              <h2 className="font-display text-2xl">Witnesses</h2>
              <ul className="mt-4 grid gap-2 text-sm">
                {(witnesses as Witness[] | null)?.map((w) => (
                  <li key={w.id}><strong>{w.name}</strong> <span className="text-[var(--muted)]">{w.id_type}</span></li>
                ))}
                {!witnesses?.length && <li className="text-[var(--muted)]">No witnesses added.</li>}
              </ul>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card>
              <h2 className="font-display text-2xl">Key dates</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div><dt className="font-bold">Submitted</dt><dd className="text-[var(--muted)]">{formatDate(app.submitted_at)}</dd></div>
                <div>
                  <dt className="font-bold">Objection period ends</dt>
                  <dd className="text-[var(--muted)]">
                    {formatDate(app.objection_window_ends_at)}
                    {objectionDays !== null && objectionDays > 0 ? ` · ${objectionDays} days left` : ""}
                  </dd>
                </div>
                <div><dt className="font-bold">Registration deadline</dt><dd className="text-[var(--muted)]">{formatDate(app.registration_deadline_at)}</dd></div>
                <div><dt className="font-bold">Registered on</dt><dd className="text-[var(--muted)]">{formatDate(app.registered_at)}</dd></div>
              </dl>
            </Card>

            {theOffice && (
              <Card>
                <h2 className="font-display text-2xl">Your Marriage Officer</h2>
                <p className="mt-3 text-sm font-bold">{theOffice.name}</p>
                {theOffice.officer_name && <p className="text-sm">{theOffice.officer_name}</p>}
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{theOffice.address}</p>
                {theOffice.phone && <p className="mt-2 text-sm text-[var(--muted)]">Phone {theOffice.phone}</p>}
                {theOffice.email && <p className="text-sm break-all text-[var(--muted)]">{theOffice.email}</p>}
              </Card>
            )}

            <Card>
              <h2 className="font-display text-2xl">History</h2>
              <ol className="mt-4 grid gap-3 text-sm">
                {(audit as { id: number; event: string; occurred_at: string }[] | null)?.map((e) => (
                  <li key={e.id} className="border-l-2 border-rule pl-3">
                    <strong className="block">{e.event.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</strong>
                    <span className="text-xs text-[var(--muted)]">{formatDateTime(e.occurred_at)}</span>
                  </li>
                ))}
                {!audit?.length && <li className="text-[var(--muted)]">Nothing recorded yet.</li>}
              </ol>
            </Card>
          </aside>
        </div>
      </main>
      <Footer locale={locale} />
    </>
  );
}
