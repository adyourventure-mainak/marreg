import { NextIntlClientProvider } from "next-intl";
import Link from "next/link";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { LandingChat } from "../components/LandingChat";
import { Footer } from "../components/Shell";
import { DEFAULT_LOCALE } from "../i18n/config";

/**
 * The un-prefixed entry page. It sits outside `app/[locale]`, so nothing has
 * established a locale or mounted a provider by the time it renders — and the
 * chat it embeds is a client component that reads translations. Both are set
 * up here explicitly, in the default locale, rather than left to a fallback.
 */
export default async function RootPage() {
  setRequestLocale(DEFAULT_LOCALE);
  const t = await getTranslations("RootLanding");
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={DEFAULT_LOCALE} messages={messages}>
      <main className="min-h-screen bg-paper">
        <section className="page py-16 md:py-24">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">{t("eyebrow")}</p>
          <h1 className="mt-5 max-w-3xl text-5xl leading-[.98] md:text-7xl">{t("title")}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">{t("lede")}</p>
          <Link href={`/${DEFAULT_LOCALE}`} className="focus mt-7 inline-flex min-h-12 items-center border-2 border-[var(--marreg-pink)] px-5 text-sm font-bold text-[var(--marreg-pink)] transition hover:bg-saffron-tint">
            {t("homeLink")} <span className="ml-2" aria-hidden="true">→</span>
          </Link>
          <LandingChat locale={DEFAULT_LOCALE} />
        </section>
        <Footer locale={DEFAULT_LOCALE} />
      </main>
    </NextIntlClientProvider>
  );
}
