import { Page } from "../../../components/Shell";
import { TrackForm } from "../../../components/TrackForm";

export default async function StatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <Page
      locale={locale}
      eyebrow="Track"
      title="Check where your application stands."
      lede="Enter your application number and the date of birth of either applicant. You do not need to sign in."
    >
      <TrackForm />
    </Page>
  );
}
