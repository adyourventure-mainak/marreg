import { getTranslations } from "next-intl/server";
import { Page } from "../../../../components/Shell";
import { UpdatePasswordForm } from "../../../../components/AuthForms";

export default async function UpdatePasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Auth");
  return (
    <Page locale={locale} eyebrow={t("eyebrow")} title={t("newPasswordTitle")} lede="">
      <UpdatePasswordForm />
    </Page>
  );
}
