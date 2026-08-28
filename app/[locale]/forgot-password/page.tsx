import { getTranslations } from "next-intl/server";
import { Page } from "../../../components/Shell";
import { ForgotPasswordForm } from "../../../components/AuthForms";

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Auth");
  return (
    <Page locale={locale} eyebrow={t("eyebrow")} title={t("forgotTitle")} lede={t("forgotLede")}>
      <ForgotPasswordForm />
    </Page>
  );
}
