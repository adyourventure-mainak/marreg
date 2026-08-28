import { rateOffice } from "../app/actions/ratings";

export function OfficeRating({ officeId, average, count }: { officeId: string; average: number; count: number }) {
  return (
    <div className="mt-5 border-t border-rule pt-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-saffron" aria-label={`${average.toFixed(1)} out of 5 stars`}>{"★".repeat(Math.round(average))}{"☆".repeat(5 - Math.round(average))}</span>
        <span className="text-[var(--muted)]">{count ? `${average.toFixed(1)} · ${count} rating${count === 1 ? "" : "s"}` : "No ratings yet"}</span>
      </div>
      <form action={rateOffice} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="office_id" value={officeId} />
        <label htmlFor={`rating-${officeId}`} className="text-xs text-[var(--muted)]">Rate this office</label>
        <select id={`rating-${officeId}`} name="rating" defaultValue="5" className="focus border border-rule bg-paper px-2 py-1 text-xs">
          {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} stars</option>)}
        </select>
        <button className="focus border border-teal px-2 py-1 text-xs font-bold text-teal">Submit</button>
      </form>
    </div>
  );
}
