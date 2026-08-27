"use client";

import { useActionState, useState } from "react";
import { reviewOffice, reviewDistrict, setOfficeActs } from "../app/actions/directory";
import type { ActionState } from "../app/actions/applications";
import { ACT_LIST, type ActCode } from "../lib/acts";
import { Alert, Button } from "./ui";

const initial: ActionState = { ok: false };

export type DirectoryEntry = {
  id: string;
  office_code: string;
  name: string;
  officer_name: string | null;
  address: string;
  pincode: string | null;
  phones: string[] | null;
  acts: ActCode[];
  verification_status: "PENDING_REVIEW" | "VERIFIED" | "REJECTED";
  review_note: string | null;
  verified_at: string | null;
  source_document: string | null;
  source_page: number | null;
  source_generated_on: string | null;
  areas: { area_name: string; area_type: string }[];
};

const AREA_LABEL: Record<string, string> = {
  POLICE_STATION: "police station",
  MUNICIPALITY: "municipality",
  MUNICIPAL_CORPORATION: "municipal corporation",
  SUB_DIVISION: "sub-division",
  BLOCK: "block",
  OTHER: "area",
};

/**
 * One entry, with its provenance shown next to the decision rather than behind
 * a link. A reviewer is being asked whether this record matches a document; the
 * document's name, page and generation date are the whole basis for answering,
 * so they are on screen at the moment of deciding.
 */
export function EntryCard({
  entry, locale, district, canWrite,
}: {
  entry: DirectoryEntry; locale: string; district: string; canWrite: boolean;
}) {
  const [reviewState, reviewAction, reviewPending] = useActionState(reviewOffice, initial);
  const [actsState, actsAction, actsPending] = useActionState(setOfficeActs, initial);
  const [rejecting, setRejecting] = useState(false);

  const decided = entry.verification_status !== "PENDING_REVIEW";

  return (
    <div className="border border-rule bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-lg font-bold">{entry.officer_name ?? entry.name}</p>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{entry.address}</p>
          {entry.phones && entry.phones.length > 0 && (
            <p className="mt-1 text-sm text-[var(--muted)]">{entry.phones.join(", ")}</p>
          )}
        </div>
        <span
          className={`shrink-0 border px-2 py-1 text-xs font-bold uppercase tracking-wider ${
            entry.verification_status === "VERIFIED"
              ? "border-[#2f7458] bg-[#e7f3ec] text-[#1f5a41]"
              : entry.verification_status === "REJECTED"
                ? "border-[#b03a3a] bg-[#fbeaea] text-[#8a2b2b]"
                : "border-rule text-[var(--muted)]"
          }`}
        >
          {entry.verification_status.replace("_", " ").toLowerCase()}
        </span>
      </div>

      {entry.areas.length > 0 && (
        <p className="mt-4 text-sm leading-6">
          <span className="font-bold">Jurisdiction: </span>
          {entry.areas.map((a) => `${a.area_name} (${AREA_LABEL[a.area_type] ?? a.area_type.toLowerCase()})`).join(", ")}
        </p>
      )}

      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
        {entry.source_document
          ? <>Source: {entry.source_document}{entry.source_page ? `, page ${entry.source_page}` : ""}
              {entry.source_generated_on ? ` — read on ${entry.source_generated_on}` : ""}. Code {entry.office_code}.</>
          : <>No source document on record — this entry predates the directory import. Code {entry.office_code}.</>}
      </p>

      {!canWrite && (entry.acts?.length ?? 0) > 0 && (
        <p className="mt-4 text-sm leading-6">
          <span className="font-bold">Acts: </span>
          {entry.acts.map((a) => ACT_LIST.find((x) => x.code === a)?.shortLabel ?? a).join(", ")}
        </p>
      )}

      {/* ---------------------------------------------------------- Acts */}
      {canWrite && <form action={actsAction} className="mt-5 border-t border-rule pt-5">
        <input type="hidden" name="office_id" value={entry.id} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="district" value={district} />
        <p className="text-sm font-bold">Acts this officer is empowered under</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          The source list does not state this. It is the reviewer&apos;s judgement, and it is recorded as such.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {ACT_LIST.map((act) => (
            <label key={act.code} className="flex items-center gap-2 text-sm font-normal">
              <input
                type="checkbox"
                name="acts"
                value={act.code}
                defaultChecked={entry.acts?.includes(act.code)}
                className="focus size-4 border border-rule"
              />
              {act.shortLabel}
            </label>
          ))}
        </div>
        {actsState.error && <Alert>{actsState.error}</Alert>}
        {actsState.ok && actsState.message && <Alert tone="success">{actsState.message}</Alert>}
        <Button variant="ghost" disabled={actsPending} className="mt-3">
          {actsPending ? "Saving…" : "Save Acts"}
        </Button>
      </form>}

      {/* -------------------------------------------------------- decision */}
      {canWrite && <form action={reviewAction} className="mt-5 border-t border-rule pt-5">
        <input type="hidden" name="office_id" value={entry.id} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="district" value={district} />

        {decided && entry.review_note && (
          <p className="mb-3 text-xs leading-5 text-[var(--muted)]">
            Noted at review: {entry.review_note}
          </p>
        )}

        {rejecting && (
          <label className="block text-sm font-bold">
            Why is this entry wrong?
            <textarea
              name="note"
              required
              rows={2}
              className="focus mt-2 w-full border border-rule bg-paper px-3 py-2 text-sm font-normal"
              placeholder="What does not match the source document?"
            />
          </label>
        )}

        {reviewState.error && <Alert>{reviewState.error}</Alert>}
        {reviewState.ok && reviewState.message && <Alert tone="success">{reviewState.message}</Alert>}

        <div className="mt-3 flex flex-wrap gap-3">
          {!rejecting && (
            <Button name="status" value="VERIFIED" disabled={reviewPending}>
              {reviewPending ? "Saving…" : decided ? "Verify" : "Matches the document — verify"}
            </Button>
          )}
          {rejecting ? (
            <>
              <Button variant="danger" name="status" value="REJECTED" disabled={reviewPending}>
                {reviewPending ? "Saving…" : "Confirm rejection"}
              </Button>
              <Button variant="ghost" type="button" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" type="button" onClick={() => setRejecting(true)}>
              Reject
            </Button>
          )}
        </div>
      </form>}
    </div>
  );
}

/**
 * The district-wide decision. The pending count is submitted with the form, so
 * if the district changed while this page was open the database refuses and
 * says so — the reviewer is told what happened rather than silently approving
 * entries that were not on screen.
 */
export function DistrictDecision({
  district, districtName, pending, sources, locale, canBulk,
}: {
  district: string; districtName: string; pending: number;
  sources: string[]; locale: string; canBulk: boolean;
}) {
  const [state, action, isPending] = useActionState(reviewDistrict, initial);
  const [open, setOpen] = useState(false);

  if (!canBulk) {
    return (
      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
        Deciding a whole district is limited to administrators. You can review these
        entries one at a time below.
      </p>
    );
  }

  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="district" value={district} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="expected_count" value={pending} />

      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      {open ? (
        <div className="border border-rule bg-paper p-5">
          <p className="text-sm leading-6">
            This publishes <strong>all {pending}</strong> remaining {pending === 1 ? "entry" : "entries"} in{" "}
            {districtName} to the public directory. Entries already verified or rejected are not affected.
          </p>
          <label className="mt-4 block text-sm font-bold">
            What did you check?
            <textarea
              name="note"
              required
              rows={2}
              defaultValue={
                sources.length > 0
                  ? `Checked against ${sources.join(", ")}.`
                  : ""
              }
              className="focus mt-2 w-full border border-rule bg-paper px-3 py-2 text-sm font-normal"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button name="status" value="VERIFIED" disabled={isPending}>
              {isPending ? "Publishing…" : `Verify all ${pending}`}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" type="button" onClick={() => setOpen(true)}>
          Verify the whole district ({pending})
        </Button>
      )}
    </form>
  );
}
