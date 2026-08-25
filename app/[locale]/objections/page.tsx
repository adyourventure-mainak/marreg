import { Page } from "../../../components/Shell";
import { ObjectionForm } from "../../../components/ObjectionForm";

export default async function ObjectionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <Page
      locale={locale}
      eyebrow="Service"
      title="File an objection."
      lede="Any person may object to a marriage being registered while its notice period is open. Your objection goes to the Marriage Officer handling the application."
    >
      <ObjectionForm />
    </Page>
  );
}
