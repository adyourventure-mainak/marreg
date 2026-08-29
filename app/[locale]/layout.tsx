import "../globals.css";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { LOCALES, isLocale } from "../../i18n/config";
import { FloatingAssistant } from "../../components/FloatingAssistant";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children, params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Must come before any translation lookup, or a statically rendered page
  // falls back to the default locale instead of the one in the URL.
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
      <FloatingAssistant locale={locale} />
    </NextIntlClientProvider>
  );
}
