import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Page } from "../../../components/Shell";
import { VideoGuides } from "../../../components/VideoGuides";

export default async function Help({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Help");

  const guides = [
    { key: "ask", href: "help/ask" },
    { key: "fees", href: "fees" },
    { key: "acts", href: "acts" },
    { key: "objections", href: "objections" },
  ] as const;

  return (
    <Page locale={locale} eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")}>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {guides.map((g) => (
          <Link key={g.key} href={`/${locale}/${g.href}`} className="focus border border-rule bg-surface p-6">
            <h2 className="text-2xl">{t(`${g.key}Title`)}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{t(`${g.key}Body`)}</p>
            <span className="mt-6 inline-block border-b-2 border-saffron pb-1 text-sm font-bold text-teal">
              {t("readGuide")} <span aria-hidden="true">→</span>
            </span>
          </Link>
        ))}
      </div>
      <VideoGuides />
    </Page>
  );
}
