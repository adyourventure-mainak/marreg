import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Header, Footer } from "../../../../components/Shell";
import { Card, StatusBadge } from "../../../../components/ui";
import { OfficerActions } from "../../../../components/OfficerActions";
import { reviewDocument } from "../../../actions/officer";
import { createClient, getProfile } from "../../../../lib/supabase/server";
import { ACTS } from "../../../../lib/acts";
import { formatDate, formatDateTime } from "../../../../lib/format";
import {
  DOCUMENT_LABELS, STATUS_GUIDANCE,
  type Application, type MarregDocument, type Office, type Party, type Profile, type Witness,
} from "../../../../lib/types";

export const dynamic = "force-dynamic";

export default async function OfficerFilePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;

  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/officer/${id}`);
  if (profile.role === "APPLICANT") redirect(`/${locale}/officer`);

  const supabase = await createClient();
  const { data } = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const app = data as Application;

  const [{ data: parties }, { data: witnesses }, { data: documents }, { data: office }, { data: objections }, { data: audit }] =
    await Promise.all([
      supabase.from("parties").select("*").eq("application_id", id),
      supabase.from("witnesses").select("*").eq("application_id", id).order("sequence"),
      supabase.from("documents").select("*").eq("application_id", id).order("created_at"),
      app.office_id ? supabase.from("offices").select("*").eq("id", app.office_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("objections").select("*").eq("application_id", id).order("filed_at", { ascending: false }),
      supabase.from("audit_events").select("*").eq("application_id", id).order("occurred_at", { ascending: false }).limit(30),
    ]);

  const docs = (documents ?? []) as MarregDocument[];
  const signed = await Promise.all(
    docs.map(async (d) => {
      const { data: url } = await supabase.storage.from("marreg-docs").createSignedUrl(d.storage_path, 600);
      return { doc: d, url: url?.signedUrl ?? null };
    }),
  );

  return (
    <>
      <Header locale={locale} />
      <main className="page py-14 md:py-20">
        <Link href={`/${locale}/officer`} className="focus text-sm font-bold text-teal">← Officer desk</Link>

        <div className="mt-6">
          <StatusBadge status={app.status} />
          <h1 className="mt-4 font-display text-5xl">{app.application_number ?? "Draft"}</h1>
          <p className="mt-2 text-lg text-[var(--muted)]">{ACTS[app.act_code].label}</p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-start">
          <div className="space-y-6">
            <Card>
              <h2 className="font-display text-2xl">Applicants</h2>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                {(parties as Party[] | null)?.map((p) => (
                  <dl key={p.id} className="border-l-2 border-saffron pl-4 text-sm leading-6">
                    <dt className="text-xs font-bold uppercase tracking-widest text-teal">{p.role.toLowerCase()}</dt>
                    <dd className="text-base font-bold">{p.name_english}</dd>
                    {p.name_bengali && <dd>{p.name_bengali}</dd>}
                    <dd className="text-[var(--muted)]">Born {formatDate(p.date_of_birth)}</dd>
                    <dd className="text-[var(--muted)]">{p.religion} · {p.marital_status_prior} · {p.occupation}</dd>
                    <dd className="text-[var(--muted)]">Father: {p.father_name ?? "—"} · Mother: {p.mother_name ?? "—"}</dd>
                    <dd className="text-[var(--muted)]">{[p.address_line1, p.address_line2, p.city, p.pincode].filter(Boolean).join(", ")}</dd>
                    <dd className="text-[var(--muted)]">{p.contact_mobile} {p.contact_email}</dd>
                  </dl>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="font-display text-2xl">Documents</h2>
              <ul className="mt-4 grid gap-4">
                {signed.map(({ doc, url }) => (
                  <li key={doc.id} className="border border-rule bg-paper p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold">{DOCUMENT_LABELS[doc.type]}</p>
                        <p className="text-xs text-[var(--muted)]">{doc.file_name} · uploaded {formatDate(doc.created_at)}</p>
                      </div>
                      {url && (
                        <a href={url} target="_blank" rel="noreferrer" className="focus border-b-2 border-saffron pb-1 text-sm font-bold text-teal">
                          Open document
                        </a>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className={`text-xs font-bold uppercase tracking-widest ${
                        doc.status === "VERIFIED" ? "text-[#1f5a41]" : doc.status === "REJECTED" ? "text-[#8a2b2b]" : "text-[var(--muted)]"
                      }`}>{doc.status.toLowerCase()}</span>

                      <form action={reviewDocument} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="document_id" value={doc.id} />
                        <input type="hidden" name="application_id" value={app.id} />
                        <input type="hidden" name="status" value="VERIFIED" />
                        <button className="focus border border-teal px-3 py-2 text-xs font-bold text-teal">Verify</button>
                      </form>

                      <form action={reviewDocument} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="document_id" value={doc.id} />
                        <input type="hidden" name="application_id" value={app.id} />
                        <input type="hidden" name="status" value="REJECTED" />
                        <input name="reason" required placeholder="Reason for rejection" className="focus min-h-9 border border-rule bg-surface px-2 py-1 text-xs" />
                        <button className="focus border border-[#b03a3a] px-3 py-2 text-xs font-bold text-[#8a2b2b]">Reject</button>
                      </form>
                    </div>
                    {doc.rejection_reason && <p className="mt-2 text-xs text-[#8a2b2b]">Reason: {doc.rejection_reason}</p>}
                  </li>
                ))}
                {docs.length === 0 && <li className="text-sm text-[var(--muted)]">No documents uploaded.</li>}
              </ul>
            </Card>

            <Card>
              <h2 className="font-display text-2xl">Witnesses</h2>
              <ul className="mt-4 grid gap-2 text-sm">
                {(witnesses as Witness[] | null)?.map((w) => (
                  <li key={w.id}>
                    <strong>{w.name}</strong>
                    <span className="text-[var(--muted)]"> · {w.id_type} ending {w.id_last_four ?? "—"} · {w.mobile ?? "no phone"}</span>
                    <br />
                    <span className="text-xs text-[var(--muted)]">{w.address}</span>
                  </li>
                ))}
                {!witnesses?.length && <li className="text-[var(--muted)]">No witnesses recorded.</li>}
              </ul>
            </Card>

            {(objections as { id: string; objector_name: string; grounds: string; status: string; filed_at: string }[] | null)?.length ? (
              <Card>
                <h2 className="font-display text-2xl">Objections</h2>
                <ul className="mt-4 grid gap-4 text-sm">
                  {(objections as { id: string; objector_name: string; grounds: string; status: string; filed_at: string }[]).map((o) => (
                    <li key={o.id} className="border-l-2 border-[#b03a3a] pl-4">
                      <strong>{o.objector_name}</strong>
                      <span className="ml-2 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">{o.status.toLowerCase()}</span>
                      <p className="mt-1 leading-6">{o.grounds}</p>
                      <p className="text-xs text-[var(--muted)]">Filed {formatDateTime(o.filed_at)}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>

          <aside className="space-y-6">
            <Card>
              <h2 className="font-display text-2xl">Actions</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{STATUS_GUIDANCE[app.status]}</p>
              <OfficerActions appId={app.id} status={app.status} />
            </Card>

            <Card>
              <h2 className="font-display text-2xl">Case dates</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div><dt className="font-bold">Received</dt><dd className="text-[var(--muted)]">{formatDate(app.receipt_date)}</dd></div>
                <div><dt className="font-bold">Marriage date</dt><dd className="text-[var(--muted)]">{formatDate(app.marriage_date)}</dd></div>
                <div><dt className="font-bold">Objection window ends</dt><dd className="text-[var(--muted)]">{formatDate(app.objection_window_ends_at)}</dd></div>
                <div><dt className="font-bold">Registration deadline</dt><dd className="text-[var(--muted)]">{formatDate(app.registration_deadline_at)}</dd></div>
                <div><dt className="font-bold">Office</dt><dd className="text-[var(--muted)]">{(office as Office | null)?.name ?? "—"}</dd></div>
              </dl>
            </Card>

            <Card>
              <h2 className="font-display text-2xl">Audit trail</h2>
              <ol className="mt-4 grid gap-3 text-sm">
                {(audit as { id: number; event: string; actor_role: string | null; occurred_at: string }[] | null)?.map((e) => (
                  <li key={e.id} className="border-l-2 border-rule pl-3">
                    <strong className="block">{e.event}</strong>
                    <span className="text-xs text-[var(--muted)]">
                      {e.actor_role ?? "system"} · {formatDateTime(e.occurred_at)}
                    </span>
                  </li>
                ))}
                {!audit?.length && <li className="text-[var(--muted)]">Nothing recorded yet.</li>}
              </ol>
            </Card>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
