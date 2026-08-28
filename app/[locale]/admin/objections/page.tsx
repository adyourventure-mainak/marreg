import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "../../../../components/Shell";
import { Card, Empty } from "../../../../components/ui";
import { AdminNav } from "../../../../components/AdminNav";
import { createClient, getProfile } from "../../../../lib/supabase/server";
import { isAdmin, onDate } from "../../../../lib/admin";
import type { Profile } from "../../../../lib/types";

export const dynamic = "force-dynamic";

type Row = {
  id: string; application_id: string; objector_name: string;
  objector_contact: string | null; grounds: string; status: string;
  filed_at: string; resolved_at: string | null; resolution_note: string | null;
  applications: { application_number: string | null } | null;
};

const TONE: Record<string, string> = {
  FILED: "text-saffron",
  UNDER_ENQUIRY: "text-saffron",
  UPHELD: "text-marreg-pink",
  DISMISSED: "text-[var(--muted)]",
  WITHDRAWN: "text-[var(--muted)]",
};

export default async function AdminObjectionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/admin/objections`);

  if (!isAdmin(profile)) {
    return (
      <Page locale={locale} eyebrow="Administration" title="Restricted area.">
        <Empty title="No access" body="Only the Registrar General's administrators may open this list."
               action={{ href: `/${locale}`, label: "Back to the portal" }} />
      </Page>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("objections")
    .select("id, application_id, objector_name, objector_contact, grounds, status, filed_at, resolved_at, resolution_note, applications(application_number)")
    .order("filed_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as Row[];

  return (
    <Page
      locale={locale}
      eyebrow="Administration"
      title="Objections."
      lede="Objections are examined by the Marriage Officer handling the application. This is the register-wide view of what has been filed."
    >
      <AdminNav locale={locale} current="objections" />

      {rows.length ? (
        <div className="mt-10 grid gap-3">
          {rows.map((o) => (
            <Card key={o.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-bold">
                  {o.applications?.application_number ?? "Application"}{" "}
                  <span className="font-normal text-[var(--muted)]">· objection by {o.objector_name}</span>
                </p>
                <span className={`text-xs font-bold uppercase tracking-widest ${TONE[o.status] ?? ""}`}>
                  {o.status.replace(/_/g, " ").toLowerCase()}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6">{o.grounds}</p>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Filed {onDate(o.filed_at)}
                {o.resolved_at ? ` · resolved ${onDate(o.resolved_at)}` : ""}
                {o.objector_contact ? ` · contact ${o.objector_contact}` : ""}
              </p>
              {o.resolution_note && (
                <p className="mt-2 text-sm text-[var(--muted)]">Note: {o.resolution_note}</p>
              )}
              <p className="mt-4">
                <Link className="focus font-bold text-teal underline"
                      href={`/${locale}/officer/${o.application_id}`}>Open the application →</Link>
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <p className="mt-10 text-sm text-[var(--muted)]">No objection has been filed.</p>
      )}
    </Page>
  );
}
