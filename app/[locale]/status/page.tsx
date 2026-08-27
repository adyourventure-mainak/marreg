import { getTranslations } from "next-intl/server";
import { Page } from "../../../components/Shell";
import { TrackForm } from "../../../components/TrackForm";

export default async function StatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Status");
  return (
    <Page
      locale={locale}
      eyebrow={t("eyebrow")}
      title={t("title")}
      lede={t("lede")}
    >
      <TrackForm />
    </Page>
  );
}
