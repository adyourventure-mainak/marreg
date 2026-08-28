import { useTranslations } from "next-intl";
import { rateOffice } from "../app/actions/ratings";

export function OfficeRating({ officeId, average, count }: { officeId: string; average: number; count: number }) {
  const t = useTranslations("Rating");
  const shown = average.toFixed(1);
  return (
    <div className="mt-5 border-t border-rule pt-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-saffron" aria-label={t("ariaStars", { average: shown })}>{"★".repeat(Math.round(average))}{"☆".repeat(5 - Math.round(average))}</span>
        <span className="text-[var(--muted)]">{count ? t("summary", { average: shown, count }) : t("none")}</span>
      </div>
      <form action={rateOffice} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="office_id" value={officeId} />
        <label htmlFor={`rating-${officeId}`} className="text-xs text-[var(--muted)]">{t("rateThis")}</label>
        <select id={`rating-${officeId}`} name="rating" defaultValue="5" className="focus border border-rule bg-paper px-2 py-1 text-xs">
          {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{t("stars", { value })}</option>)}
        </select>
        <button className="focus border border-teal px-2 py-1 text-xs font-bold text-teal">{t("submit")}</button>
      </form>
    </div>
  );
}
