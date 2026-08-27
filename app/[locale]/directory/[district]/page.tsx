import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "../../../../components/Shell";
import { Card, Empty } from "../../../../components/ui";
import { DistrictDecision, EntryCard, type DirectoryEntry } from "../../../../components/DirectoryReview";
import { createClient, getProfile } from "../../../../lib/supabase/server";
import type { Profile } from "../../../../lib/types";

export const dynamic = "force-dynamic";

const STAFF = ["MARRIAGE_OFFICER", "HINDU_REGISTRAR", "DISTRICT_REGISTRAR", "RGM_ADMIN", "AUDITOR", "SUPPORT_READONLY"];
const ADMIN = ["RGM_ADMIN", "DISTRICT_REGISTRAR"];
/** AUDITOR and SUPPORT_READONLY may read every entry but may not decide one. */
const CAN_WRITE = ["MARRIAGE_OFFICER", "HINDU_REGISTRAR", "DISTRICT_REGISTRAR", "RGM_ADMIN"];

export default async function DistrictReviewPage({
  params,
}: {
  params: Promise<{ locale: string; district: string }>;
}) {
  const { locale, district } = await params;
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/directory/${district}`);

  if (!STAFF.includes(profile.role)) {
    return (
      <Page locale={locale} eyebrow="Marriage Officer Directory" title="Restricted area.">
        <Empty title="No access" body="Only registry staff may review directory entries." action={{ href: `/${locale}`, label: "Back to the portal" }} />
      </Page>
    );
  }

  const supabase = await createClient();

  // Staff read every status here — the offices_read policy admits is_staff() —
  // so a decided entry stays on screen alongside the pending ones rather than
  // vanishing the moment it is verified.
  const [{ data: districtRow }, { data: offices }] = await Promise.all([
    supabase.from("districts").select("code, name").eq("code", district).maybeSingle(),
    supabase
      .from("offices")
      .select("id, office_code, name, officer_name, address, pincode, phones, acts, verification_status, review_note, verified_at, source_document, source_page, source_generated_on")
      .eq("district_code", district)
      .order("verification_status", { ascending: true })
      .order("officer_name"),
  ]);

  if (!districtRow) {
    return (
      <Page locale={locale} eyebrow="Marriage Officer Directory" title="Unknown district.">
        <Empty title="Not found" body={`No district on record with the code ${district}.`} action={{ href: `/${locale}/directory`, label: "Back to the review queue" }} />
      </Page>
    );
  }

  const rows = (offices ?? []) as Omit<DirectoryEntry, "areas">[];
  const ids = rows.map((r) => r.id);

  const { data: areas } = ids.length
    ? await supabase.from("office_jurisdictions").select("office_id, area_name, area_type").in("office_id", ids)
    : { data: [] as { office_id: string; area_name: string; area_type: string }[] };

  const byOffice = new Map<string, { area_name: string; area_type: string }[]>();
  for (const a of (areas ?? []) as { office_id: string; area_name: string; area_type: string }[]) {
    const list = byOffice.get(a.office_id) ?? [];
    list.push({ area_name: a.area_name, area_type: a.area_type });
    byOffice.set(a.office_id, list);
  }

  const entries: DirectoryEntry[] = rows.map((r) => ({ ...r, areas: byOffice.get(r.id) ?? [] }));
  const pending = entries.filter((e) => e.verification_status === "PENDING_REVIEW");
  const sources = Array.from(new Set(pending.map((e) => e.source_document).filter((s): s is string => !!s)));

  return (
    <Page
      locale={locale}
      eyebrow="Marriage Officer Directory"
      title={`${districtRow.name}.`}
      lede={
        pending.length > 0
          ? `${pending.length} of ${entries.length} ${entries.length === 1 ? "entry" : "entries"} awaiting review. Check each against the source list before it becomes public.`
          : `All ${entries.length} ${entries.length === 1 ? "entry has" : "entries have"} been decided.`
      }
    >
      {!CAN_WRITE.includes(profile.role) && (
        <p className="mt-6 border-l-4 border-teal bg-teal-tint px-4 py-3 text-sm leading-6 text-teal">
          Your role is read-only. You can see every entry and its source, but decisions
          are made by a marriage officer or registrar.
        </p>
      )}

      <p className="mt-6">
        <Link href={`/${locale}/directory`} className="focus text-sm font-bold underline decoration-2 underline-offset-4">
          ← Back to the review queue
        </Link>
      </p>

      {pending.length > 0 && (
        <Card className="mt-8">
          <p className="text-sm font-bold">Decide the whole district</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            The records were read from the source list mechanically, so they are
            consistent with each other. Read a sample against the document, then decide
            the district in one action — or work through them individually below.
          </p>
          <DistrictDecision
            district={district}
            districtName={districtRow.name}
            pending={pending.length}
            sources={sources}
            locale={locale}
            canBulk={ADMIN.includes(profile.role)}
          />
        </Card>
      )}

      {entries.length === 0 ? (
        <Empty title="No entries" body="No directory entries are on record for this district." action={{ href: `/${locale}/directory`, label: "Back to the review queue" }} />
      ) : (
        <div className="mt-8 grid gap-3">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} locale={locale} district={district} canWrite={CAN_WRITE.includes(profile.role)} />
          ))}
        </div>
      )}
    </Page>
  );
}
