import "../globals.css";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

const LOCALES = ["en", "bn"] as const;

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
  if (!LOCALES.includes(locale as (typeof LOCALES)[number])) notFound();
  return <>{children}</>;
}
