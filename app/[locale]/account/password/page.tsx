import { Page } from "../../../../components/Shell";
import { UpdatePasswordForm } from "../../../../components/AuthForms";

export default async function UpdatePasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <Page locale={locale} eyebrow="Citizen account" title="Choose a new password." lede="">
      <UpdatePasswordForm />
    </Page>
  );
}
