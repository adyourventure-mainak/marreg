import { getTranslations } from "next-intl/server";
import { Page } from "../../../components/Shell";
import { SignInForm, EmailOtpForm } from "../../../components/AuthForms";

export default async function LoginPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { next, error } = await searchParams;
  const t = await getTranslations("Auth");

  return (
    <Page locale={locale} eyebrow={t("eyebrow")} title={t("signInTitle")} lede={t("signInLede")}>
      <SignInForm next={next ?? `/${locale}/account`} notice={error} />
      <EmailOtpForm next={next ?? `/${locale}/account`} />
    </Page>
  );
}
