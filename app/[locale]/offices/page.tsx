import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Page } from "../../../components/Shell";
import { Card, Empty } from "../../../components/ui";
import { createClient } from "../../../lib/supabase/server";
import { ACTS, type ActCode } from "../../../lib/acts";
import type { District, Office } from "../../../lib/types";
import { OfficeRating } from "../../../components/OfficeRating";
import { NearMeButton } from "../../../components/NearMeButton";

export const dynamic = "force-dynamic";

export default async function OfficesPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; district?: string; act?: string; pincode?: string }>;
}) {
  const { locale } = await params;
  const { q = "", district = "", act = "", pincode = "" } = await searchParams;
  const t = await getTranslations("Offices");
  const tc = await getTranslations("Common");
  const ta = await getTranslations("Acts");
  const supabase = await createClient();

  const { data: districts } = await supabase.from("districts").select("*").order("name");
  // All five arguments are named, because two overloads of search_offices
  // exist and a partial call is ambiguous between them.
  const { data: offices, error } = await supabase.rpc("search_offices", {
    p_query: q || null,
    p_district: district || null,
    p_act: act || null,
    p_police_station: null,
    // Deliberately not filtered on the citizen's own PIN. "Near me" resolves a
    // location to a PIN and a district, but search_offices ANDs its arguments,
    // and a citizen's home PIN is almost never an office's: filtering on both
    // returned nothing for Kolkata, where the district in fact holds 65
    // offices. So the district selects, and the PIN only orders -- an office
    // sharing the citizen's PIN is shown first, and the rest still appear.
    p_pincode: null,
  });

  const near = /^\d{6}$/.test(pincode) ? pincode : null;
  const list = ((offices ?? []) as Office[]).slice().sort((a, b) => {
    if (!near) return 0;
    return Number(b.pincode === near) - Number(a.pincode === near);
  });
  const { data: ratings } = await supabase.from("office_ratings").select("office_id, rating").in("office_id", list.map((o) => o.id));
  const ratingFor = (id: string) => {
    const values = (ratings ?? []).filter((r) => r.office_id === id).map((r) => r.rating);
    return { count: values.length, average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0 };
  };
  // The directory carries a Bengali name for each district, so a reader on the
  // Bengali site sees the district in the script the rest of the page is in.
  const districtName = (code: string) => {
    const d = (districts as District[] | null)?.find((x) => x.code === code);
    if (!d) return code;
    return (locale === "bn" ? d.name_bn : null) ?? d.name;
  };

  return (
    <Page
      locale={locale}
      eyebrow={t("eyebrow")}
      title={t("title")}
      lede={t("lede")}
    >
      <div className="mt-10 md:max-w-xs">
        <NearMeButton locale={locale} />
      </div>

      <form className="mt-4 grid gap-4 border border-rule bg-surface p-5 md:grid-cols-[1fr_220px_220px_auto]">
        {pincode && <input type="hidden" name="pincode" value={pincode} />}
        <label className="text-sm font-bold">
          {t("searchLabel")}
          <input
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-base font-normal"
          />
        </label>

        <label className="text-sm font-bold">
          {t("districtLabel")}
          <select name="district" defaultValue={district} className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-base font-normal">
            <option value="">{t("allDistricts")}</option>
            {(districts as District[] | null)?.map((d) => (
              <option key={d.code} value={d.code}>{districtName(d.code)}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold">
          {t("actLabel")}
          <select name="act" defaultValue={act} className="focus mt-2 min-h-12 w-full border border-rule bg-paper px-3 text-base font-normal">
            <option value="">{t("anyAct")}</option>
            {Object.values(ACTS).map((a) => (
              <option key={a.code} value={a.code}>{ta(`rules.${a.code}.shortLabel`)}</option>
            ))}
          </select>
        </label>

        <button className="focus min-h-12 self-end bg-saffron px-6 text-sm font-bold">{t("submit")}</button>
      </form>

      {error && (
        <p className="mt-6 border-l-4 border-[#b03a3a] bg-[#fbeaea] px-4 py-3 text-sm text-[#8a2b2b]">
          {t("loadError", { message: error.message })}
        </p>
      )}

      {!error && list.length === 0 ? (
        <Empty
          title={t("emptyTitle")}
          body={t("emptyBody")}
          action={{ href: `/${locale}/offices`, label: t("clearFilters") }}
        />
      ) : (
        <>
          <p className="mt-8 text-sm font-bold text-[var(--muted)]">
            {t("resultCount", { count: list.length })}
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
                  {o.police_station ? ` · ${t("policeStation", { name: o.police_station })}` : ""}
                  {o.pincode ? ` — ${o.pincode}` : ""}
                </p>

                <dl className="mt-4 grid gap-1 text-sm">
                  {o.phone && (
                    <div className="flex gap-2"><dt className="font-bold">{tc("phone")}</dt><dd className="text-[var(--muted)]">{o.phone}</dd></div>
                  )}
                  {o.email && (
                    <div className="flex gap-2"><dt className="font-bold">{tc("email")}</dt><dd className="break-all text-[var(--muted)]">{o.email}</dd></div>
                  )}
                </dl>

                {o.acts?.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {o.acts.map((code) => (
                      <li key={code} className="border border-rule px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                        {ACTS[code as ActCode] ? ta(`rules.${code}.shortLabel`) : code}
                      </li>
                    ))}
                  </ul>
                )}

                <OfficeRating officeId={o.id} {...ratingFor(o.id)} />

                <Link
                  href={`/${locale}/apply?office=${o.id}`}
                  className="focus mt-5 inline-block border-b-2 border-saffron pb-1 text-sm font-bold text-teal"
                >
                  {t("applyToOffice")} <span aria-hidden="true">→</span>
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
