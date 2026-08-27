import { getTranslations } from "next-intl/server";
import { Page } from "../../../components/Shell";
import { createClient } from "../../../lib/supabase/server";
import { ACTS, type ActCode } from "../../../lib/acts";

export const dynamic = "force-dynamic";

type Fee = { id: string; purpose: string; act_code: ActCode | null; amount: number; gazette_reference: string | null };

export default async function FeesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Fees");
  const supabase = await createClient();
  const { data } = await supabase.from("fee_schedule").select("*").is("effective_to", null).order("purpose");
  const fees = (data ?? []) as Fee[];

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
              <th className="p-4">Service</th>
              <th className="p-4">Act</th>
              <th className="p-4 text-right">Fee</th>
            </tr>
          </thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id} className="border-b border-rule last:border-0">
                <td className="p-4">{f.purpose}</td>
                <td className="p-4 text-[var(--muted)]">{f.act_code ? ACTS[f.act_code].shortLabel : "All Acts"}</td>
                <td className="p-4 text-right font-bold">₹ {Number(f.amount).toFixed(2)}</td>
              </tr>
            ))}
            {fees.length === 0 && (
              <tr><td colSpan={3} className="p-6 text-center text-[var(--muted)]">The fee schedule has not been published yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-6 max-w-2xl text-sm leading-6 text-[var(--muted)]">
        Fees shown here are drawn from the published schedule held by the Office of the Registrar General of Marriages.
        Where a gazette reference is marked as pending, the figure has not yet been verified against the current notification.
      </p>
    </Page>
  );
}
