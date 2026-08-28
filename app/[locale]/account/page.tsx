import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Page } from "../../../components/Shell";
import { Card, Empty, StatusBadge } from "../../../components/ui";
import { createClient, getProfile } from "../../../lib/supabase/server";
import { ACTS } from "../../../lib/acts";
import { formatDate } from "../../../lib/format";
import type { Application, Profile } from "../../../lib/types";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Account");
  const ts = await getTranslations("ApplicationStatus");
  const ta = await getTranslations("Acts");
  const supabase = await createClient();
  const profile = (await getProfile()) as Profile | null;

  const { data } = await supabase.from("applications").select("*").order("updated_at", { ascending: false });
  const applications = (data ?? []) as Application[];

  return (
    <Page
      locale={locale}
      eyebrow={t("eyebrow")}
      title={profile?.full_name ? t("welcome", { name: profile.full_name.split(" ")[0] }) : t("fallbackTitle")}
      lede={t("lede")}
    >
      {applications.length === 0 ? (
        <Empty
          title={t("emptyTitle")}
          body={t("emptyBody")}
          action={{ href: `/${locale}/apply`, label: t("startApplication") }}
        />
      ) : (
        <div className="mt-10 grid gap-4">
          {applications.map((a) => (
            <Card key={a.id} className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-xl">
                <StatusBadge status={a.status} />
                <h2 className="mt-3 font-display text-3xl">{a.application_number ?? t("unsubmittedDraft")}</h2>
                <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{ta(`rules.${a.act_code}.label`)}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{ts(`guidance.${a.status}`)}</p>
                <p className="mt-3 text-xs uppercase tracking-widest text-[var(--muted)]">
                  {t("lastUpdated", { when: formatDate(a.updated_at) })}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <Link href={`/${locale}/account/${a.id}`} className="focus border border-teal px-5 py-3 text-center text-sm font-bold text-teal">
                  {t("viewDetails")}
                </Link>
                {["DRAFT", "AWAITING_APPLICANT_FIX"].includes(a.status) && (
                  <Link href={`/${locale}/apply/${a.id}`} className="focus bg-saffron px-5 py-3 text-center text-sm font-bold">
                    {t("continue")}
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-4">
        <Link href={`/${locale}/apply`} className="focus border-b-2 border-saffron pb-1 text-sm font-bold text-teal">
          {t("startAnother")} <span aria-hidden="true">→</span>
        </Link>
        <Link href={`/${locale}/account/password`} className="focus border-b-2 border-rule pb-1 text-sm font-bold text-[var(--muted)]">
          {t("changePassword")}
        </Link>
      </div>
    </Page>
  );
}
