import { getTranslations } from "next-intl/server";
import { Page } from "../../../components/Shell";
import { createClient } from "../../../lib/supabase/server";
import { ACTS, type ActCode } from "../../../lib/acts";

export const dynamic = "force-dynamic";

type Fee = { id: string; purpose: string; act_code: ActCode | null; amount: number; gazette_reference: string | null };

export default async function FeesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Fees");
  const ta = await getTranslations("Acts");
  const supabase = await createClient();
  const { data } = await supabase.from("fee_schedule").select("*").is("effective_to", null).order("purpose");
  const fees = (data ?? []) as Fee[];

  // The purposes are rows in `fee_schedule`, so the schedule stays the source
  // of truth and a purpose added there without a translation still renders —
  // in the English the department entered rather than as a missing key.
  const purposeLabel = (purpose: string) => {
    const key = `purposes.${purpose.replace(/[^a-zA-Z ]/g, "").split(" ")
      .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
      .join("")}`;
    return t.has(key) ? t(key) : purpose;
  };

  return (
    <Page
      locale={locale}
      eyebrow={t("eyebrow")}
      title={t("title")}
      lede={t("lede")}
    >
      <div className="mt-10 max-w-3xl overflow-x-auto border border-rule bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-teal text-left text-xs font-bold uppercase tracking-widest text-white">
              <th className="p-4">{t("service")}</th>
              <th className="p-4">{t("act")}</th>
              <th className="p-4 text-right">{t("fee")}</th>
            </tr>
          </thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id} className="border-b border-rule last:border-0">
                <td className="p-4">{purposeLabel(f.purpose)}</td>
                <td className="p-4 text-[var(--muted)]">{f.act_code ? ta(`rules.${f.act_code}.shortLabel`) : t("allActs")}</td>
                <td className="p-4 text-right font-bold">₹ {Number(f.amount).toFixed(2)}</td>
              </tr>
            ))}
            {fees.length === 0 && (
              <tr><td colSpan={3} className="p-6 text-center text-[var(--muted)]">{t("empty")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-6 max-w-2xl text-sm leading-6 text-[var(--muted)]">{t("note")}</p>
    </Page>
  );
}
