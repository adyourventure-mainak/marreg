import { redirect } from "next/navigation";
import { Page } from "../../../components/Shell";
import { Alert } from "../../../components/ui";
import { createClient } from "../../../lib/supabase/server";
import { TransferForm } from "../../../components/TransferForm";

export default async function TransferMoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/transfer-mo`);
  const [{ data: applications }, { data: offices }] = await Promise.all([
    supabase.from("applications").select("id, application_number").eq("owner_id", user.id).order("created_at", { ascending: false }),
    supabase.from("offices").select("id, name, district_code").eq("is_functional", true).order("name"),
  ]);
  return <Page locale={locale} eyebrow="Service" title="Request a transfer of Marriage Officer." lede="This follows the registry's official Change of Marriage Officer process. The request is reviewed by the registry before any office changes.">
    <p className="mt-6 max-w-2xl text-sm text-[var(--muted)]">Official reference: <a className="underline" href="https://rgmwb.gov.in/MARREG_Portal/MARREG_Change_MO.aspx" target="_blank" rel="noreferrer">West Bengal Change of MO</a>.</p>
    {applications?.length ? <TransferForm applications={applications} offices={offices ?? []} /> : <div className="mt-8"><Alert>You need an application before requesting a Marriage Officer transfer.</Alert></div>}
  </Page>;
}
