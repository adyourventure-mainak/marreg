"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  saveParties, saveDetails, saveWitnesses, uploadDocument, deleteDocument, submitApplication,
  type ActionState,
} from "../app/actions/applications";
import { createClient } from "../lib/supabase/client";
import { ACTS, partyRoles, type ActCode } from "../lib/acts";
import { DOCUMENT_LABELS, type Application, type District, type MarregDocument, type Office, type Party, type Witness } from "../lib/types";
import { Alert, Button, Field } from "./ui";
import { formatDate } from "../lib/format";

const initial: ActionState = { ok: false };
const STEPS = ["Applicants", "Marriage & office", "Witnesses", "Documents", "Review"];

export function Stepper({ current, appId, locale }: { current: number; appId: string; locale: string }) {
  return (
    <ol className="mb-9 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-widest">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        return (
          <li key={label}>
            <Link
              href={`/${locale}/apply/${appId}?step=${n}`}
              className={`focus block border px-3 py-2 ${active ? "border-teal bg-teal text-white" : "border-rule text-[var(--muted)] hover:border-teal hover:text-teal"}`}
            >
              0{n} {label}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ step 1 */

function PartyFields({ index, role, party, districts }: { index: number; role: string; party?: Party; districts: District[] }) {
  const p = (k: string) => `p${index}_${k}`;
  return (
    <fieldset className="border border-rule bg-paper p-5">
      <legend className="px-2 font-display text-2xl">
        Applicant {index + 1} <span className="text-base text-[var(--muted)]">({role.toLowerCase()})</span>
      </legend>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <Field label="Full legal name (English)" name={p("name")} required defaultValue={party?.name_english} hint="Exactly as on your identity documents." />
        <Field label="Name in Bengali" name={p("name_bn")} defaultValue={party?.name_bengali} />
        <Field label="Date of birth" name={p("dob")} type="date" required defaultValue={party?.date_of_birth} />
        <Field label="Religion" name={p("religion")} defaultValue={party?.religion} />
        <Field label="Occupation" name={p("occupation")} defaultValue={party?.occupation} />
        <Field label="Marital status before this marriage">
          <select name={p("marital")} defaultValue={party?.marital_status_prior ?? "Unmarried"} className="focus mt-2 min-h-12 w-full border border-rule bg-surface px-3 text-base font-normal">
            <option>Unmarried</option>
            <option>Divorced</option>
            <option>Widowed</option>
          </select>
        </Field>
        <Field label="Father's name" name={p("father")} defaultValue={party?.father_name} />
        <Field label="Mother's name" name={p("mother")} defaultValue={party?.mother_name} />
        <Field label="Address line 1" name={p("address1")} defaultValue={party?.address_line1} className="md:col-span-2" />
        <Field label="Address line 2" name={p("address2")} defaultValue={party?.address_line2} className="md:col-span-2" />
        <Field label="City / village" name={p("city")} defaultValue={party?.city} />
        <Field label="District">
          <select name={p("district")} defaultValue={party?.district_code ?? ""} className="focus mt-2 min-h-12 w-full border border-rule bg-surface px-3 text-base font-normal">
            <option value="">Select a district</option>
            {districts.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Pincode" name={p("pincode")} defaultValue={party?.pincode} />
        <Field label="Mobile number" name={p("mobile")} type="tel" defaultValue={party?.contact_mobile} />
        <Field label="Email address" name={p("email")} type="email" defaultValue={party?.contact_email} className="md:col-span-2" />
      </div>
    </fieldset>
  );
}

export function StepParties({ app, parties, districts }: { app: Application; parties: Party[]; districts: District[] }) {
  const [state, action, pending] = useActionState(saveParties, initial);
  const roles = partyRoles(app.act_code);
  const find = (role: string) => parties.find((p) => p.role === role);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="application_id" value={app.id} />
      <input type="hidden" name="act_code" value={app.act_code} />
      {roles.map((role, i) => (
        <PartyFields key={role} index={i} role={role} party={find(role)} districts={districts} />
      ))}
      {state.error && <Alert>{state.error}</Alert>}
      <div className="flex justify-end border-t border-rule pt-5">
        <Button disabled={pending}>{pending ? "Saving…" : "Save and continue"}</Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ step 2 */

export function StepDetails({ app, districts, initialOffice }: { app: Application; districts: District[]; initialOffice: Office | null }) {
  const [state, action, pending] = useActionState(saveDetails, initial);
  const rule = ACTS[app.act_code];

  const [district, setDistrict] = useState(app.district_code ?? initialOffice?.district_code ?? "");
  const [offices, setOffices] = useState<Office[]>(initialOffice ? [initialOffice] : []);
  const [officeId, setOfficeId] = useState(app.office_id ?? initialOffice?.id ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!district) { setOffices([]); return; }
    let cancelled = false;
    setLoading(true);
    createClient()
      .rpc("search_offices", { p_query: null, p_district: district, p_act: app.act_code })
      .then(({ data }) => {
        if (cancelled) return;
        setOffices((data ?? []) as Office[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [district, app.act_code]);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="application_id" value={app.id} />
      <input type="hidden" name="act_code" value={app.act_code} />

      <fieldset className="border border-rule bg-paper p-5">
        <legend className="px-2 font-display text-2xl">The marriage</legend>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{rule.summary}</p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field
            label={rule.alreadySolemnised ? "Date the marriage took place" : "Intended date of marriage"}
            name="marriage_date"
            type="date"
            required
            defaultValue={app.marriage_date}
          />
          <Field label="Place of marriage" name="marriage_place" defaultValue={app.marriage_place} placeholder="Venue, city" />
        </div>
      </fieldset>

      <fieldset className="border border-rule bg-paper p-5">
        <legend className="px-2 font-display text-2xl">Your Marriage Officer</legend>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Choose the office that will handle your registration. Only officers who register marriages under {rule.shortLabel} are listed.
        </p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="District" required>
            <select
              value={district}
              onChange={(e) => { setDistrict(e.target.value); setOfficeId(""); }}
              className="focus mt-2 min-h-12 w-full border border-rule bg-surface px-3 text-base font-normal"
            >
              <option value="">Select a district</option>
              {districts.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
          </Field>

          <Field label="Marriage Officer" required hint={loading ? "Loading offices…" : `${offices.length} available`}>
            <select
              name="office_id"
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
              required
              disabled={!district || loading}
              className="focus mt-2 min-h-12 w-full border border-rule bg-surface px-3 text-base font-normal"
            >
              <option value="">{district ? "Select an office" : "Choose a district first"}</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}{o.police_station ? ` — PS ${o.police_station}` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {district && !loading && offices.length === 0 && (
          <Alert tone="info">
            No officer in this district is listed for {rule.shortLabel}. Try a neighbouring district, or{" "}
            <Link className="underline" href="/en/offices">browse the full directory</Link>.
          </Alert>
        )}

        {officeId && (
          <OfficeSummary office={offices.find((o) => o.id === officeId) ?? initialOffice} />
        )}
      </fieldset>

      {state.error && <Alert>{state.error}</Alert>}
      <div className="flex justify-end border-t border-rule pt-5">
        <Button disabled={pending}>{pending ? "Saving…" : "Save and continue"}</Button>
      </div>
    </form>
  );
}

function OfficeSummary({ office }: { office?: Office | null }) {
  if (!office) return null;
  return (
    <div className="mt-5 border-l-2 border-saffron bg-surface p-4 text-sm leading-6">
      <strong className="block text-base">{office.name}</strong>
      {office.officer_name && <span className="block font-semibold">{office.officer_name}</span>}
      <span className="block text-[var(--muted)]">
        {office.address}{office.pincode ? ` — ${office.pincode}` : ""}
      </span>
      {office.phone && <span className="block text-[var(--muted)]">Phone {office.phone}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ step 3 */

export function StepWitnesses({ app, witnesses }: { app: Application; witnesses: Witness[] }) {
  const [state, action, pending] = useActionState(saveWitnesses, initial);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="application_id" value={app.id} />
      <p className="text-sm leading-6 text-[var(--muted)]">
        Two witnesses are required; a third is optional. Witnesses must attend the registration in person with the identity document listed here.
      </p>

      {[0, 1, 2].map((i) => {
        const w = witnesses.find((x) => x.sequence === i + 1);
        return (
          <fieldset key={i} className="border border-rule bg-paper p-5">
            <legend className="px-2 font-display text-2xl">
              Witness {i + 1} {i === 2 && <span className="text-base text-[var(--muted)]">(optional)</span>}
            </legend>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <Field label="Full name" name={`w${i}_name`} required={i < 2} defaultValue={w?.name} />
              <Field label="Mobile number" name={`w${i}_mobile`} type="tel" defaultValue={w?.mobile} />
              <Field label="Address" name={`w${i}_address`} defaultValue={w?.address} className="md:col-span-2" />
              <Field label="Identity document">
                <select name={`w${i}_id_type`} defaultValue={w?.id_type ?? "Aadhaar"} className="focus mt-2 min-h-12 w-full border border-rule bg-surface px-3 text-base font-normal">
                  <option>Aadhaar</option>
                  <option>Voter ID</option>
                  <option>PAN</option>
                  <option>Passport</option>
                  <option>Driving Licence</option>
                </select>
              </Field>
              <Field label="Last four digits of that document" name={`w${i}_id_last4`} defaultValue={w?.id_last_four} hint="We never store the full number." />
            </div>
          </fieldset>
        );
      })}

      {state.error && <Alert>{state.error}</Alert>}
      <div className="flex justify-end border-t border-rule pt-5">
        <Button disabled={pending}>{pending ? "Saving…" : "Save and continue"}</Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ step 4 */

export function StepDocuments({ app, documents }: { app: Application; documents: MarregDocument[] }) {
  const [state, action, pending] = useActionState(uploadDocument, initial);
  const required = ACTS[app.act_code].documents;

  return (
    <div className="space-y-8">
      <div className="border-l-2 border-saffron bg-surface p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-teal">Required for {ACTS[app.act_code].shortLabel}</p>
        <ul className="mt-3 grid gap-1 text-sm leading-6 text-[var(--muted)]">
          {required.map((d) => <li key={d}>· {d}</li>)}
        </ul>
      </div>

      <form action={action} className="grid gap-5 border border-rule bg-paper p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <input type="hidden" name="application_id" value={app.id} />
        <Field label="Document type" required>
          <select name="type" required className="focus mt-2 min-h-12 w-full border border-rule bg-surface px-3 text-base font-normal">
            {Object.entries(DOCUMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="File" required hint="JPG, PNG, WebP, or PDF · up to 5 MB">
          <input name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="focus mt-2 min-h-12 w-full border border-rule bg-surface px-3 py-2 text-sm font-normal" />
        </Field>
        <Button disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
        {state.error && <div className="md:col-span-3"><Alert>{state.error}</Alert></div>}
        {state.ok && state.message && <div className="md:col-span-3"><Alert tone="success">{state.message}</Alert></div>}
      </form>

      <div>
        <h2 className="font-display text-2xl">Uploaded documents</h2>
        {documents.length === 0 ? (
          <p className="mt-3 border border-rule bg-surface p-5 text-sm text-[var(--muted)]">Nothing uploaded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--rule)] border border-rule bg-surface">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-bold">{DOCUMENT_LABELS[d.type]}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {d.file_name} · {Math.round((d.size_bytes ?? 0) / 1024)} KB · uploaded {formatDate(d.created_at)}
                  </p>
                  {d.status === "REJECTED" && d.rejection_reason && (
                    <p className="mt-1 text-xs font-bold text-[#8a2b2b]">Rejected: {d.rejection_reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs font-bold uppercase tracking-widest ${d.status === "VERIFIED" ? "text-[#1f5a41]" : d.status === "REJECTED" ? "text-[#8a2b2b]" : "text-[var(--muted)]"}`}>
                    {d.status.toLowerCase()}
                  </span>
                  <form action={deleteDocument}>
                    <input type="hidden" name="document_id" value={d.id} />
                    <input type="hidden" name="application_id" value={app.id} />
                    <button className="focus text-xs font-bold text-[#8a2b2b] underline">Remove</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end border-t border-rule pt-5">
        <Link href={`/en/apply/${app.id}?step=5`} className="focus inline-flex min-h-12 items-center bg-saffron px-5 text-sm font-bold">
          Continue to review
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 5 */

export function StepReview({
  app, parties, witnesses, documents, office,
}: {
  app: Application; parties: Party[]; witnesses: Witness[]; documents: MarregDocument[]; office: Office | null;
}) {
  const [state, action, pending] = useActionState(submitApplication, initial);
  const rule = ACTS[app.act_code];

  return (
    <div className="space-y-6">
      <section className="border border-rule bg-surface p-6">
        <h2 className="font-display text-2xl">{rule.label}</h2>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="font-bold">Marriage date</dt><dd className="text-[var(--muted)]">{formatDate(app.marriage_date)}</dd></div>
          <div><dt className="font-bold">Place</dt><dd className="text-[var(--muted)]">{app.marriage_place ?? "—"}</dd></div>
          <div className="sm:col-span-2">
            <dt className="font-bold">Marriage Officer</dt>
            <dd className="text-[var(--muted)]">{office ? `${office.name} — ${office.address}` : "Not chosen"}</dd>
          </div>
        </dl>
      </section>

      <section className="border border-rule bg-surface p-6">
        <h2 className="font-display text-2xl">Applicants</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {parties.map((p) => (
            <div key={p.id} className="border-l-2 border-saffron pl-4 text-sm leading-6">
              <span className="text-xs font-bold uppercase tracking-widest text-teal">{p.role.toLowerCase()}</span>
              <strong className="mt-1 block text-base">{p.name_english}</strong>
              <span className="block text-[var(--muted)]">Born {formatDate(p.date_of_birth)}</span>
              <span className="block text-[var(--muted)]">{[p.address_line1, p.city, p.pincode].filter(Boolean).join(", ") || "Address not given"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-rule bg-surface p-6">
        <h2 className="font-display text-2xl">Witnesses</h2>
        <ul className="mt-4 grid gap-2 text-sm">
          {witnesses.map((w) => (
            <li key={w.id}>
              <strong>{w.name}</strong>
              <span className="text-[var(--muted)]">{w.id_type ? ` · ${w.id_type}` : ""}{w.mobile ? ` · ${w.mobile}` : ""}</span>
            </li>
          ))}
          {witnesses.length === 0 && <li className="text-[var(--muted)]">No witnesses added.</li>}
        </ul>
      </section>

      <section className="border border-rule bg-surface p-6">
        <h2 className="font-display text-2xl">Documents</h2>
        <ul className="mt-4 grid gap-2 text-sm">
          {documents.map((d) => <li key={d.id}>· {DOCUMENT_LABELS[d.type]} <span className="text-[var(--muted)]">({d.file_name})</span></li>)}
          {documents.length === 0 && <li className="text-[var(--muted)]">No documents uploaded.</li>}
        </ul>
      </section>

      <form action={action} className="border-2 border-teal bg-teal-tint p-6">
        <input type="hidden" name="application_id" value={app.id} />
        <h2 className="font-display text-2xl text-teal">Declaration</h2>
        <p className="mt-3 text-sm leading-6">
          I declare that the information given above is true to the best of my knowledge, and that I understand a false declaration is
          punishable under law. On submission an application number is issued and the objection period of {rule.objectionDays} days begins.
        </p>
        <label className="mt-4 flex items-start gap-3 text-sm font-bold">
          <input type="checkbox" required className="focus mt-1 h-5 w-5" />
          I agree to the declaration above.
        </label>
        {state.error && <Alert>{state.error}</Alert>}
        <div className="mt-6">
          <Button disabled={pending}>{pending ? "Submitting…" : "Submit application"}</Button>
        </div>
      </form>
    </div>
  );
}
