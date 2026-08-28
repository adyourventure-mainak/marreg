import { getTranslations } from "next-intl/server";
import { Page } from "../../../../components/Shell";
import { CitizenAssistant } from "../../../../components/CitizenAssistant";

/**
 * Government destinations only. The URLs are the record itself and so are not
 * translated; the title and description beside each one are.
 */
const GOV_SOURCES = [
  { key: "portal", href: "https://rgmwb.gov.in/MARREG_Portal/MARREG_Home.aspx" },
  { key: "service", href: "https://wbregistration.gov.in/%28S%28x0zlsd24racxad5r25302zkf%29%29/marriage_regs.aspx" },
  { key: "sma", href: "https://www.indiacode.nic.in/indiacode/handle/123456789/1387?view_type=browse" },
  { key: "hma", href: "https://www.indiacode.nic.in/handle/123456789/17272?view_type=browse" },
  { key: "eservices", href: "https://wb.gov.in/e-services.aspx" },
  { key: "academy", href: "https://wbja.wb.gov.in/news/compulsory-registration-of-all-marriages-solemnized-under-the-hindu-marriage-act-1955" },
] as const;

export default async function Ask({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Ask");

  return (
    <Page locale={locale} eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")}>
      <CitizenAssistant locale={locale} />
      <section className="mt-12 border border-rule bg-surface p-6">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">{t("sourcesLabel")}</p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("sourcesNote")}</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {GOV_SOURCES.map((source) => (
            <a
              key={source.href}
              href={source.href}
              target="_blank"
              rel="noreferrer"
              className="focus border border-rule bg-paper p-4 transition hover:border-teal"
            >
              <h2 className="text-base font-bold">{t(`sources.${source.key}.title`)}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t(`sources.${source.key}.description`)}</p>
              <span className="mt-4 inline-block border-b-2 border-saffron pb-1 text-sm font-bold text-teal">
                {t("openSource")} <span aria-hidden="true">→</span>
              </span>
            </a>
          ))}
        </div>
      </section>
    </Page>
  );
}
