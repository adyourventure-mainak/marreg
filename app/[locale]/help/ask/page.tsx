import { Page } from "../../../../components/Shell";
import { CitizenAssistant } from "../../../../components/CitizenAssistant";

const GOV_SOURCES = [
  {
    title: "MARREG portal",
    description: "Official West Bengal marriage registration portal and entry point for online services.",
    href: "https://rgmwb.gov.in/MARREG_Portal/MARREG_Home.aspx",
  },
  {
    title: "Marriage registration service",
    description: "West Bengal registration department page describing the online marriage registration process.",
    href: "https://wbregistration.gov.in/%28S%28x0zlsd24racxad5r25302zkf%29%29/marriage_regs.aspx",
  },
  {
    title: "Special Marriage Act, 1954",
    description: "India Code text of the Act used for Special Marriage registration.",
    href: "https://www.indiacode.nic.in/indiacode/handle/123456789/1387?view_type=browse",
  },
  {
    title: "Hindu Marriage Act, 1955",
    description: "India Code text of the Act used for Hindu marriage registration.",
    href: "https://www.indiacode.nic.in/handle/123456789/17272?view_type=browse",
  },
  {
    title: "West Bengal e-Services",
    description: "State portal listing the online application of marriage certificate service.",
    href: "https://wb.gov.in/e-services.aspx",
  },
  {
    title: "Judicial Academy notice",
    description: "Government notice on compulsory registration under the Hindu Marriage Act, 1955.",
    href: "https://wbja.wb.gov.in/news/compulsory-registration-of-all-marriages-solemnized-under-the-hindu-marriage-act-1955",
  },
] as const;

export default async function Ask({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <Page
      locale={locale}
      eyebrow="Help centre"
      title="Ask about marriage registration."
      lede="Put a question in your own words. Every answer is drawn from the marriage Acts and the verified office directory, and the sections it came from are shown underneath."
    >
      <CitizenAssistant locale={locale} />
      <section className="mt-12 border border-rule bg-surface p-6">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">Official online sources</p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          These links stay on government domains only. They are the online records and service pages the help
          section can point people to when they need to read the rule or start a filing.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {GOV_SOURCES.map((source) => (
            <a
              key={source.href}
              href={source.href}
              target="_blank"
              rel="noreferrer"
              className="focus border border-rule bg-paper p-4 transition hover:border-teal"
            >
              <h2 className="text-base font-bold">{source.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{source.description}</p>
              <span className="mt-4 inline-block border-b-2 border-saffron pb-1 text-sm font-bold text-teal">
                Open source →
              </span>
            </a>
          ))}
        </div>
      </section>
    </Page>
  );
}
