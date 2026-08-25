import Link from "next/link";
import { Page } from "../../../components/Shell";
import { Card, Empty, StatusBadge } from "../../../components/ui";
import { createClient, getProfile } from "../../../lib/supabase/server";
import { ACTS } from "../../../lib/acts";
import { formatDate } from "../../../lib/format";
import { STATUS_GUIDANCE } from "../../../lib/types";
import type { Application, Profile } from "../../../lib/types";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const profile = (await getProfile()) as Profile | null;

  const { data } = await supabase.from("applications").select("*").order("updated_at", { ascending: false });
  const applications = (data ?? []) as Application[];

  return (
    <Page
      locale={locale}
      eyebrow="My account"
      title={profile?.full_name ? `Welcome, ${profile.full_name.split(" ")[0]}.` : "My applications"}
      lede="Every application you have started, with its current step and what happens next."
    >
      {applications.length === 0 ? (
        <Empty
          title="You have no applications yet"
          body="Start an application and we will guide you through each step — applicants, marriage details, witnesses, documents, and submission."
          action={{ href: `/${locale}/apply`, label: "Start an application" }}
        />
      ) : (
        <div className="mt-10 grid gap-4">
          {applications.map((a) => (
            <Card key={a.id} className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-xl">
                <StatusBadge status={a.status} />
                <h2 className="mt-3 font-display text-3xl">{a.application_number ?? "Unsubmitted draft"}</h2>
                <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{ACTS[a.act_code].label}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{STATUS_GUIDANCE[a.status]}</p>
                <p className="mt-3 text-xs uppercase tracking-widest text-[var(--muted)]">
                  Last updated {formatDate(a.updated_at)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <Link href={`/${locale}/account/${a.id}`} className="focus border border-teal px-5 py-3 text-center text-sm font-bold text-teal">
                  View details
                </Link>
                {["DRAFT", "AWAITING_APPLICANT_FIX"].includes(a.status) && (
                  <Link href={`/${locale}/apply/${a.id}`} className="focus bg-saffron px-5 py-3 text-center text-sm font-bold">
                    Continue
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-4">
        <Link href={`/${locale}/apply`} className="focus border-b-2 border-saffron pb-1 text-sm font-bold text-teal">
          Start another application →
        </Link>
        <Link href={`/${locale}/account/password`} className="focus border-b-2 border-rule pb-1 text-sm font-bold text-[var(--muted)]">
          Change password
        </Link>
      </div>
    </Page>
  );
}
