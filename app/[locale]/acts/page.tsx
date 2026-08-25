import Link from "next/link";
import { Page } from "../../../components/Shell";
import { ACT_LIST } from "../../../lib/acts";

export default async function ActsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <Page
      locale={locale}
      eyebrow="Acts & rules"
      title="Which law applies to your marriage?"
      lede="Each Act sets its own eligibility, notice period, objection window, and required documents. Choose the one that matches your ceremony."
    >
      <div className="mt-10 grid gap-5">
        {ACT_LIST.map((act, i) => (
          <article key={act.code} className="border border-rule bg-surface p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <span className="text-xs font-bold uppercase tracking-widest text-teal">Act {i + 1}</span>
                <h2 className="mt-2 font-display text-3xl leading-tight">{act.label}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{act.summary}</p>
              </div>
              <span className="shrink-0 rounded-full bg-teal-tint px-3 py-1 text-xs font-bold text-teal">
                {act.alreadySolemnised ? "Already solemnised" : "Notice first"}
              </span>
            </div>

            <dl className="mt-6 grid gap-5 border-t border-rule pt-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-bold">Objection period</dt>
                <dd className="text-[var(--muted)]">{act.objectionDays} days from receipt</dd>
              </div>
              <div>
                <dt className="font-bold">{act.noticeDays ? "Notice period" : "Completion window"}</dt>
                <dd className="text-[var(--muted)]">
                  {act.noticeDays ? `${act.noticeDays} days` : `${act.deadlineMonths} calendar months`}
                </dd>
              </div>
              <div>
                <dt className="font-bold">Documents</dt>
                <dd className="text-[var(--muted)]">{act.documents.length} required</dd>
              </div>
            </dl>

            <ul className="mt-5 flex flex-wrap gap-2">
              {act.documents.map((d) => (
                <li key={d} className="border border-rule px-3 py-1 text-xs font-semibold text-[var(--muted)]">{d}</li>
              ))}
            </ul>

            <Link href={`/${locale}/apply`} className="focus mt-6 inline-block border-b-2 border-saffron pb-1 text-sm font-bold text-teal">
              Apply under this Act <span aria-hidden="true">→</span>
            </Link>
          </article>
        ))}
      </div>
    </Page>
  );
}
