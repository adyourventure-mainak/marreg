import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "../../../components/Shell";
import { Card, Empty } from "../../../components/ui";
import { createClient, getProfile } from "../../../lib/supabase/server";
import type { Profile } from "../../../lib/types";

export const dynamic = "force-dynamic";

const STAFF = ["MARRIAGE_OFFICER", "HINDU_REGISTRAR", "DISTRICT_REGISTRAR", "RGM_ADMIN", "AUDITOR", "SUPPORT_READONLY"];

type QueueRow = {
  district_code: string;
  district_name: string;
  pending: number;
  verified: number;
  rejected: number;
  sources: string[] | null;
  generated_on: string | null;
};

export default async function DirectoryQueuePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/directory`);

  if (!STAFF.includes(profile.role)) {
    return (
      <Page locale={locale} eyebrow="Marriage Officer Directory" title="Restricted area.">
        <Empty
          title="No access"
          body="Only registry staff may review directory entries."
          action={{ href: `/${locale}`, label: "Back to the portal" }}
        />
      </Page>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("district_review_queue");
  const rows = (data as QueueRow[] | null) ?? [];
  const totalPending = rows.reduce((n, r) => n + Number(r.pending), 0);

  return (
    <Page
      locale={locale}
      eyebrow="Marriage Officer Directory"
      title="Entries awaiting review."
      lede="Records extracted from the district lists are held back from the public directory until a person has checked them against the source document. Nothing below is visible to citizens yet."
    >
      {error && (
        <Card className="mt-10">
          <p className="text-sm text-[#8a2b2b]">{error.message}</p>
        </Card>
      )}

      {!error && rows.length === 0 && (
        <Empty
          title="Nothing awaiting review"
          body="Every directory entry has been decided. New entries appear here when a district list is imported."
          action={{ href: `/${locale}/offices`, label: "View the public directory" }}
        />
      )}

      {rows.length > 0 && (
        <>
          <p className="mt-10 text-sm text-[var(--muted)]">
            {totalPending} {totalPending === 1 ? "entry" : "entries"} awaiting review across{" "}
            {rows.length} {rows.length === 1 ? "district" : "districts"}.
          </p>
          <div className="mt-4 grid gap-3">
            {rows.map((r) => (
              <Card key={r.district_code}>
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div>
                    <Link
                      href={`/${locale}/directory/${r.district_code}`}
                      className="focus text-lg font-bold underline decoration-2 underline-offset-4"
                    >
                      {r.district_name}
                    </Link>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      {r.sources && r.sources.length > 0
                        ? <>From {r.sources.join(", ")}{r.generated_on ? `, read on ${r.generated_on}` : ""}</>
                        : "No source document on record"}
                    </p>
                  </div>
                  <p className="text-sm">
                    <strong>{r.pending}</strong> pending
                    {Number(r.verified) > 0 && <span className="text-[var(--muted)]"> · {r.verified} verified</span>}
                    {Number(r.rejected) > 0 && <span className="text-[var(--muted)]"> · {r.rejected} rejected</span>}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
