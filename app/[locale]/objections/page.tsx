import { getTranslations } from "next-intl/server";
import { Page } from "../../../components/Shell";
import { ObjectionForm } from "../../../components/ObjectionForm";

export default async function ObjectionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Objections");
  return (
    <Page locale={locale} eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")}>
      <ObjectionForm />
    </Page>
  );
}
