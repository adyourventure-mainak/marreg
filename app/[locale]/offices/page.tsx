import Link from "next/link";
import { Page } from "../../../components/Shell";
import { Card, Empty } from "../../../components/ui";
import { createClient } from "../../../lib/supabase/server";
import { ACTS, type ActCode } from "../../../lib/acts";
import type { District, Office } from "../../../lib/types";

export const dynamic = "force-dynamic";

export default async function OfficesPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; district?: string; act?: string }>;
}) {
  const { locale } = await params;
  const { q = "", district = "", act = "" } = await searchParams;
  const supabase = await createClient();

  const { data: districts } = await supabase.from("districts").select("*").order("name");
  const { data: offices, error } = await supabase.rpc("search_offices", {
    p_query: q || null,
    p_district: district || null,
    p_act: act || null,
  });

  const list = (offices ?? []) as Office[];
  const districtName = (code: string) => (districts as District[] | null)?.find((d) => d.code === code)?.name ?? code;

  return (
    <Page
      locale={locale}
      eyebrow="Directory"
      title="Find a Marriage Officer near you."
      lede="Search by district, police station, pincode, or the name of the office. Choose an officer who registers marriages under your Act."
    >
      <form className="mt-10 grid gap-4 border border-rule bg-surface p-5 md:grid-cols-[1fr_220px_220px_auto]">
        <label className="text-sm font-bold">
          Search
          <input
            name="q"
            defaultValue={q}
            placeholder="Office name, police station, or pincode"
            className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-base font-normal"
          />
        </label>

        <label className="text-sm font-bold">
          District
          <select name="district" defaultValue={district} className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-base font-normal">
            <option value="">All districts</option>
            {(districts as District[] | null)?.map((d) => (
              <option key={d.code} value={d.code}>{d.name}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold">
          Act
          <select name="act" defaultValue={act} className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-base font-normal">
            <option value="">Any Act</option>
            {Object.values(ACTS).map((a) => (
              <option key={a.code} value={a.code}>{a.shortLabel}</option>
            ))}
          </select>
        </label>

        <button className="focus min-h-12 self-end bg-saffron px-6 text-sm font-bold">Search</button>
      </form>

      {error && (
        <p className="mt-6 border-l-4 border-[#b03a3a] bg-[#fbeaea] px-4 py-3 text-sm text-[#8a2b2b]">
          The directory could not be loaded: {error.message}
        </p>
      )}

      {!error && list.length === 0 ? (
        <Empty
          title="No Marriage Officer matched that search"
          body="Try a wider search — clear the Act filter, or search by district alone."
          action={{ href: `/${locale}/offices`, label: "Clear filters" }}
        />
      ) : (
        <>
          <p className="mt-8 text-sm font-bold text-[var(--muted)]">
            {list.length} {list.length === 1 ? "office" : "offices"} found
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {list.map((o) => (
              <Card key={o.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-widest text-teal">{districtName(o.district_code)}</span>
                    <h2 className="mt-2 text-2xl leading-tight">{o.name}</h2>
                    {o.officer_name && (
                      <p className="mt-1 text-sm font-semibold">
                        {o.officer_name}
                        {o.designation ? ` · ${o.designation}` : ""}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-teal-tint px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-teal">
                    {o.office_code}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                  {o.address}
                  {o.police_station ? ` · PS ${o.police_station}` : ""}
                  {o.pincode ? ` — ${o.pincode}` : ""}
                </p>

                <dl className="mt-4 grid gap-1 text-sm">
                  {o.phone && (
                    <div className="flex gap-2"><dt className="font-bold">Phone</dt><dd className="text-[var(--muted)]">{o.phone}</dd></div>
                  )}
                  {o.email && (
                    <div className="flex gap-2"><dt className="font-bold">Email</dt><dd className="break-all text-[var(--muted)]">{o.email}</dd></div>
                  )}
                </dl>

                {o.acts?.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {o.acts.map((code) => (
                      <li key={code} className="border border-rule px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                        {ACTS[code as ActCode]?.shortLabel ?? code}
                      </li>
                    ))}
                  </ul>
                )}

                <Link
                  href={`/${locale}/apply?office=${o.id}`}
                  className="focus mt-5 inline-block border-b-2 border-saffron pb-1 text-sm font-bold text-teal"
                >
                  Apply to this office <span aria-hidden="true">→</span>
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
