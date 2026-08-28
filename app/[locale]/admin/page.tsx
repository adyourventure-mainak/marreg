import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "../../../components/Shell";
import { Card, Empty } from "../../../components/ui";
import { AdminNav } from "../../../components/AdminNav";
import { createClient, getProfile } from "../../../lib/supabase/server";
import { isAdmin, onDateTime } from "../../../lib/admin";
import type { Profile } from "../../../lib/types";

export const dynamic = "force-dynamic";

/** A count that reads as a decision to make, not a statistic to admire. */
function Tile({ label, value, hint, href }: { label: string; value: number; hint: string; href: string }) {
  return (
    <Link href={href} className="focus block border border-rule bg-surface p-6 hover:border-teal">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <p className="mt-3 font-display text-4xl font-bold">{value}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{hint}</p>
    </Link>
  );
}

export default async function AdminOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/admin`);

  if (!isAdmin(profile)) {
    return (
      <Page locale={locale} eyebrow="Administration" title="Restricted area.">
        <Empty
          title="No access"
          body="Only the Registrar General's administrators may open the administration area."
          action={{ href: `/${locale}`, label: "Back to the portal" }}
        />
      </Page>
    );
  }

  const supabase = await createClient();
  const count = (q: { count: number | null }) => q.count ?? 0;

  const [pendingOffices, verifiedOffices, openApplications, awaitingFix, openObjections, invitations, recent] =
    await Promise.all([
      supabase.from("offices").select("id", { count: "exact", head: true }).eq("verification_status", "PENDING_REVIEW"),
      supabase.from("offices").select("id", { count: "exact", head: true }).eq("verification_status", "VERIFIED"),
      supabase.from("applications").select("id", { count: "exact", head: true })
        .in("status", ["SUBMITTED", "UNDER_SCRUTINY", "NOTICE_PUBLISHED", "OBJECTION_UNDER_ENQUIRY", "AWAITING_REGISTRATION"]),
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "AWAITING_APPLICANT_FIX"),
      supabase.from("objections").select("id", { count: "exact", head: true }).in("status", ["FILED", "UNDER_ENQUIRY"]),
      supabase.from("staff_invitations").select("email", { count: "exact", head: true })
        .is("consumed_at", null).is("revoked_at", null),
      supabase.from("audit_events").select("event, entity_type, entity_id, occurred_at, actor_role")
        .order("occurred_at", { ascending: false }).limit(8),
    ]);

  const events = (recent.data ?? []) as {
    event: string; entity_type: string; entity_id: string | null;
    occurred_at: string; actor_role: string | null;
  }[];

  return (
    <Page
      locale={locale}
      eyebrow="Administration"
      title="Registrar General's desk."
      lede="What is waiting on a decision, across the registry."
    >
      <AdminNav locale={locale} current="overview" />

      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          label="Directory awaiting review" value={count(pendingOffices)}
          hint="Not visible to the public until verified" href={`/${locale}/directory`}
        />
        <Tile
          label="Officers published" value={count(verifiedOffices)}
          hint="Visible in Find a Marriage Officer" href={`/${locale}/offices`}
        />
        <Tile
          label="Applications in progress" value={count(openApplications)}
          hint="Submitted through to awaiting registration" href={`/${locale}/admin/applications`}
        />
        <Tile
          label="Returned to the applicant" value={count(awaitingFix)}
          hint="Sent back for correction" href={`/${locale}/admin/applications?status=AWAITING_APPLICANT_FIX`}
        />
        <Tile
          label="Objections open" value={count(openObjections)}
          hint="Filed or under enquiry" href={`/${locale}/admin/objections`}
        />
        <Tile
          label="Logins authorised, unused" value={count(invitations)}
          hint="Awaiting the officer's first sign-in" href={`/${locale}/admin/staff`}
        />
      </div>

      <h2 className="mt-14 font-display text-2xl font-bold">Latest activity</h2>
      {events.length ? (
        <Card className="mt-5">
          <ul className="divide-y divide-[var(--rule)]">
            {events.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="font-bold">{e.event}</span>
                <span className="text-sm text-[var(--muted)]">
                  {e.entity_type}
                  {e.actor_role ? ` · ${e.actor_role.replace(/_/g, " ").toLowerCase()}` : ""}
                </span>
                <span className="text-sm text-[var(--muted)]">{onDateTime(e.occurred_at)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5">
            <Link className="focus font-bold text-teal underline" href={`/${locale}/admin/audit`}>
              The full audit trail →
            </Link>
          </p>
        </Card>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">Nothing has been recorded yet.</p>
      )}
    </Page>
  );
}
