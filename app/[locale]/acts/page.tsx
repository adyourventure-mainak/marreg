import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Page } from "../../../components/Shell";
import { ACT_LIST } from "../../../lib/acts";
import { ACT_DOCUMENT_KEYS } from "../../../i18n/acts";

export default async function ActsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Acts");

  return (
    <Page locale={locale} eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")}>
      <div className="mt-10 grid gap-5">
        {ACT_LIST.map((act, i) => (
          <article key={act.code} className="border border-rule bg-surface p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <span className="text-xs font-bold uppercase tracking-widest text-teal">{t("actIndex", { index: i + 1 })}</span>
                <h2 className="mt-2 font-display text-3xl leading-tight">{t(`rules.${act.code}.label`)}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{t(`rules.${act.code}.summary`)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-teal-tint px-3 py-1 text-xs font-bold text-teal">
                {act.alreadySolemnised ? t("alreadySolemnised") : t("noticeFirst")}
              </span>
            </div>

            <dl className="mt-6 grid gap-5 border-t border-rule pt-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-bold">{t("objectionPeriod")}</dt>
                <dd className="text-[var(--muted)]">{t("objectionValue", { days: act.objectionDays })}</dd>
              </div>
              <div>
                <dt className="font-bold">{act.noticeDays ? t("noticePeriod") : t("completionWindow")}</dt>
                <dd className="text-[var(--muted)]">
                  {act.noticeDays
                    ? t("noticeValue", { days: act.noticeDays })
                    : t("completionValue", { months: act.deadlineMonths })}
                </dd>
              </div>
              <div>
                <dt className="font-bold">{t("documents")}</dt>
                <dd className="text-[var(--muted)]">{t("documentsValue", { count: act.documents.length })}</dd>
              </div>
            </dl>

            <ul className="mt-5 flex flex-wrap gap-2">
              {ACT_DOCUMENT_KEYS[act.code].map((key) => (
                <li key={key} className="border border-rule px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                  {t(`rules.${act.code}.documents.${key}`)}
                </li>
              ))}
            </ul>

            <Link href={`/${locale}/apply`} className="focus mt-6 inline-block border-b-2 border-saffron pb-1 text-sm font-bold text-teal">
              {t("applyUnder")} <span aria-hidden="true">→</span>
            </Link>
          </article>
        ))}
      </div>
    </Page>
  );
}
