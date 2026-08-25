import { Page } from "../../../components/Shell";
import { SignUpForm } from "../../../components/AuthForms";

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <Page
      locale={locale}
      eyebrow="Citizen account"
      title="Create your MARREG account."
      lede="One account covers every marriage registration service — applications, documents, status, and certified copies."
    >
      <SignUpForm />
    </Page>
  );
}
