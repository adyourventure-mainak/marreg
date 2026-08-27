import { Page } from "../../../components/Shell";
import { SignInForm, EmailOtpForm } from "../../../components/AuthForms";

export default async function LoginPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { next, error } = await searchParams;

  return (
    <Page
      locale={locale}
      eyebrow="Citizen account"
      title="Sign in to continue."
      lede="Your account keeps your draft applications, uploaded documents, and status updates in one place."
    >
      <SignInForm next={next ?? `/${locale}/account`} notice={error} />
      <EmailOtpForm next={next ?? `/${locale}/account`} />
    </Page>
  );
}
