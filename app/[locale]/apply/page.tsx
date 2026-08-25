import Link from "next/link";
import { Page } from "../../../components/Shell";
import { Card, StatusBadge } from "../../../components/ui";
import { createClient } from "../../../lib/supabase/server";
import { createApplication } from "../../actions/applications";
import { ACT_LIST } from "../../../lib/acts";
import { formatDate } from "../../../lib/format";
import type { Application } from "../../../lib/types";

export const dynamic = "force-dynamic";

export default async function ApplyPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; office?: string }>;
}) {
  const { locale } = await params;
  const { error, office } = await searchParams;
  const supabase = await createClient();

  const { data: preselected } = office
    ? await supabase.from("offices").select("name").eq("id", office).maybeSingle()
    : { data: null };

  const { data: drafts } = await supabase
    .from("applications")
    .select("*")
    .in("status", ["DRAFT", "AWAITING_APPLICANT_FIX"])
    .order("updated_at", { ascending: false });

  return (
    <Page
      locale={locale}
      eyebrow="Apply online"
      title="Which Act applies to your marriage?"
      lede="Your answer sets the documents you need, the objection period, and which Marriage Officers can register your marriage."
    >
      {error && (
        <p className="mt-6 border-l-4 border-[#b03a3a] bg-[#fbeaea] px-4 py-3 text-sm text-[#8a2b2b]">
          The application could not be started: {error}
        </p>
      )}

      {(drafts as Application[] | null)?.length ? (
        <section className="mt-10">
          <h2 className="font-display text-3xl">Continue where you left off</h2>
          <div className="mt-4 grid gap-3">
            {(drafts as Application[]).map((d) => (
              <Card key={d.id} className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <StatusBadge status={d.status} />
                  <p className="mt-2 font-display text-2xl">{d.application_number ?? "Unsubmitted draft"}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {d.act_code.replace(/_/g, " ")} · last saved {formatDate(d.updated_at)} · step {d.current_step} of 5
                  </p>
                </div>
                <Link href={`/${locale}/apply/${d.id}`} className="focus bg-saffron px-5 py-3 text-sm font-bold">
                  Resume
                </Link>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="font-display text-3xl">Start a new application</h2>
        {office && preselected && (
          <p className="mt-4 border-l-2 border-saffron bg-surface p-4 text-sm leading-6">
            This application will be sent to <strong>{preselected.name}</strong>. You can change the office at step 2.
          </p>
        )}
        <form action={createApplication} className="mt-5 grid gap-4">
          {office && <input type="hidden" name="office_id" value={office} />}
          {ACT_LIST.map((act) => (
            <label key={act.code} className="focus-within:outline focus-within:outline-2 focus-within:outline-saffron block cursor-pointer border border-rule bg-surface p-5 hover:border-teal">
              <div className="flex items-start gap-4">
                <input type="radio" name="act_code" value={act.code} required className="mt-1.5 h-5 w-5 shrink-0" />
                <div>
                  <h3 className="font-display text-2xl leading-tight">{act.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{act.summary}</p>
                  <p className="mt-3 text-xs font-bold uppercase tracking-widest text-teal">
                    {act.alreadySolemnised ? "Marriage already solemnised" : "Notice given before the marriage"} ·{" "}
                    {act.objectionDays}-day objection period
                  </p>
                </div>
              </div>
            </label>
          ))}
          <div className="mt-2">
            <button className="focus min-h-12 bg-saffron px-6 text-sm font-bold">Start application</button>
          </div>
        </form>
      </section>
    </Page>
  );
}
