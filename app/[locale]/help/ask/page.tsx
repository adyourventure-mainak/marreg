import { Page } from "../../../../components/Shell";
import { CitizenAssistant } from "../../../../components/CitizenAssistant";

export default async function Ask({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <Page
      locale={locale}
      eyebrow="Help centre"
      title="Ask about marriage registration."
      lede="Put a question in your own words. Every answer is drawn from the marriage Acts and the verified office directory, and the sections it came from are shown underneath."
    >
      <CitizenAssistant locale={locale} />
    </Page>
  );
}
