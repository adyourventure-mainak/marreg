import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../../../components/Shell";
import { Alert } from "../../../../components/ui";
import { Stepper, StepParties, StepDetails, StepWitnesses, StepDocuments, StepReview } from "../../../../components/ApplyWizard";
import { createClient } from "../../../../lib/supabase/server";
import { ACTS } from "../../../../lib/acts";
import type { Application, District, MarregDocument, Office, Party, Witness } from "../../../../lib/types";

export const dynamic = "force-dynamic";

export default async function ApplicationWizardPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { locale, id } = await params;
  const { step } = await searchParams;
  const supabase = await createClient();

  const { data: app } = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (!app) notFound();
  const application = app as Application;

  const [{ data: parties }, { data: witnesses }, { data: documents }, { data: districts }, { data: office }] = await Promise.all([
    supabase.from("parties").select("*").eq("application_id", id),
    supabase.from("witnesses").select("*").eq("application_id", id).order("sequence"),
    supabase.from("documents").select("*").eq("application_id", id).order("created_at"),
    supabase.from("districts").select("*").order("name"),
    application.office_id
      ? supabase.from("offices").select("*").eq("id", application.office_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const current = Math.min(5, Math.max(1, Number(step) || application.current_step || 1));
  const readOnly = !["DRAFT", "AWAITING_APPLICANT_FIX"].includes(application.status);

  return (
    <>
      <Header locale={locale} />
      <main className="page py-14 md:py-20">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">
          {ACTS[application.act_code].label}
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl leading-[1.05] md:text-5xl">
          {application.application_number ?? "Your application"}
        </h1>

        {readOnly ? (
          <>
            <Alert tone="info">
              This application has been submitted and can no longer be edited here.{" "}
              <Link className="underline" href={`/${locale}/account/${application.id}`}>View its progress</Link>.
            </Alert>
          </>
        ) : (
          <>
            {application.status === "AWAITING_APPLICANT_FIX" && application.officer_note && (
              <Alert tone="error">The office has asked for a correction: {application.officer_note}</Alert>
            )}

            <div className="mt-10 max-w-3xl">
              <Stepper current={current} appId={application.id} locale={locale} />

              {current === 1 && (
                <StepParties app={application} parties={(parties ?? []) as Party[]} districts={(districts ?? []) as District[]} />
              )}
              {current === 2 && (
                <StepDetails app={application} districts={(districts ?? []) as District[]} initialOffice={(office ?? null) as Office | null} />
              )}
              {current === 3 && <StepWitnesses app={application} witnesses={(witnesses ?? []) as Witness[]} />}
              {current === 4 && (
                <StepDocuments
                  app={application}
                  documents={(documents ?? []) as MarregDocument[]}
                  parties={(parties ?? []) as Party[]}
                />
              )}
              {current === 5 && (
                <StepReview
                  app={application}
                  parties={(parties ?? []) as Party[]}
                  witnesses={(witnesses ?? []) as Witness[]}
                  documents={(documents ?? []) as MarregDocument[]}
                  office={(office ?? null) as Office | null}
                  locale={locale}
                />
              )}
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
