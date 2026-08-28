import { getTranslations } from "next-intl/server";
import { Page } from "../../../components/Shell";
import { SignUpForm } from "../../../components/AuthForms";

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Auth");
  return (
    <Page locale={locale} eyebrow={t("eyebrow")} title={t("signUpTitle")} lede={t("signUpLede")}>
      <SignUpForm />
    </Page>
  );
}
