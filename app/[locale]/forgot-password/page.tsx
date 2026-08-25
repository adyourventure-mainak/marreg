import { Page } from "../../../components/Shell";
import { ForgotPasswordForm } from "../../../components/AuthForms";

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <Page locale={locale} eyebrow="Citizen account" title="Reset your password." lede="We will email you a link to set a new password.">
      <ForgotPasswordForm />
    </Page>
  );
}
