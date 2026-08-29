import { redirect } from "next/navigation";
import { Page } from "../../../../components/Shell";
import { Card, Empty } from "../../../../components/ui";
import { AdminNav } from "../../../../components/AdminNav";
import { createClient, getProfile } from "../../../../lib/supabase/server";
import { isAdmin, onDateTime } from "../../../../lib/admin";
import { reviewKnowledgeSource } from "../../../actions/admin";
import type { Profile } from "../../../../lib/types";

export const dynamic = "force-dynamic";

/**
 * The review gate for the citizen assistant's corpus.
 *
 * Extraction from a PDF is mechanical, so a source arrives PENDING_REVIEW and
 * the assistant cannot see it. Verifying a source here is what makes its text
 * answerable to the public — which is why the sample of extracted sections is
 * shown on the page rather than behind a link: a reviewer should be reading
 * the text, not the filename.
 */

type Source = {
  id: string;
  kind: string;
  acts: string[] | null;
  title: string;
  citation: string;
  source_document: string | null;
  verification_status: "PENDING_REVIEW" | "VERIFIED" | "REJECTED";
  verified_at: string | null;
  review_note: string | null;
  knowledge_chunks: { count: number }[];
};

type Sample = { source_id: string; seq: number; heading: string | null; body: string; page: number | null };

const TONE: Record<string, string> = {
  PENDING_REVIEW: "text-saffron",
  VERIFIED: "text-teal",
  REJECTED: "text-marreg-pink",
};

export default async function AdminKnowledgePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/admin/knowledge`);

  if (!isAdmin(profile)) {
    return (
      <Page locale={locale} eyebrow="Administration" title="Restricted area.">
        <Empty title="No access" body="Only the Registrar General's administrators may open this list."
               action={{ href: `/${locale}`, label: "Back to the portal" }} />
      </Page>
    );
  }

  const supabase = await createClient();

  const { data: sourceData } = await supabase
    .from("knowledge_sources")
    .select("id, kind, acts, title, citation, source_document, verification_status, verified_at, review_note, knowledge_chunks(count)")
    .order("verification_status")
    .order("title");
  const sources = (sourceData ?? []) as unknown as Source[];

  // Every chunk, not a sample. A reviewer verifying a source is making its
  // whole text public, so the whole text has to be reachable on this page --
  // the Christian and Parsi Acts carry 86 sections between them, and approving
  // those off the first three would be a rubber stamp, not a review.
  const { data: sampleData } = await supabase
    .from("knowledge_chunks")
    .select("source_id, seq, heading, body, page")
    .order("source_id")
    .order("seq");
  const samples = (sampleData ?? []) as Sample[];

  return (
    <Page
      locale={locale}
      eyebrow="Administration"
      title="Source documents."
      lede="The citizen assistant may quote only from documents verified here. Text is extracted from the published PDF without alteration — check it against the PDF before verifying, because verifying is what makes it public."
    >
      <AdminNav locale={locale} current="knowledge" />

      {sources.length ? (
        <div className="mt-10 grid gap-4">
          {sources.map((s) => {
            const all = samples.filter((c) => c.source_id === s.id);
            const preview = all.slice(0, 3);
            const rest = all.slice(3);
            const chunks = s.knowledge_chunks?.[0]?.count ?? 0;

            return (
              <Card key={s.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="font-bold">{s.title}</p>
                  <span className={`text-xs font-bold uppercase tracking-widest ${TONE[s.verification_status] ?? ""}`}>
                    {s.verification_status.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>

                <p className="mt-2 text-sm text-[var(--muted)]">
                  {chunks} section{chunks === 1 ? "" : "s"} extracted
                  {s.source_document ? ` · ${s.source_document}` : ""}
                  {s.acts?.length ? ` · ${s.acts.join(", ")}` : ""}
                  {s.verified_at ? ` · reviewed ${onDateTime(s.verified_at)}` : ""}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">Cited to citizens as: {s.citation}</p>
                {s.review_note && <p className="mt-1 text-sm text-[var(--muted)]">Note: {s.review_note}</p>}

                {preview.length > 0 && (
                  <div className="mt-4 border-l-4 border-rule pl-4">
                    {preview.map((c, i) => (
                      <div key={i} className="mt-3 first:mt-0">
                        <p className="text-xs font-bold uppercase tracking-widest text-teal">
                          {c.heading ?? "Extract"}{c.page ? ` · page ${c.page}` : ""}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                          {c.body.slice(0, 320)}{c.body.length > 320 ? "…" : ""}
                        </p>
                      </div>
                    ))}
                    {rest.length > 0 && (
                      <details className="mt-4">
                        <summary className="focus cursor-pointer text-xs font-bold uppercase tracking-widest text-teal">
                          Read the remaining {rest.length} section{rest.length === 1 ? "" : "s"}
                        </summary>
                        {rest.map((c) => (
                          <div key={c.seq} className="mt-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-teal">
                              {c.heading ?? "Extract"}{c.page ? ` \u00b7 page ${c.page}` : ""}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{c.body}</p>
                          </div>
                        ))}
                      </details>
                    )}
                  </div>
                )}

                <form action={reviewKnowledgeSource} className="mt-5 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="source_id" value={s.id} />
                  <label className="flex-1 text-sm font-bold">
                    Review note
                    <input
                      name="note"
                      placeholder="Checked against the published PDF"
                      className="mt-2 min-h-11 w-full border border-rule bg-paper px-3 text-sm font-normal"
                    />
                  </label>
                  <button
                    name="status"
                    value="VERIFIED"
                    className="focus min-h-11 border border-ink bg-ink px-5 text-sm font-bold text-paper"
                  >
                    Verify
                  </button>
                  <button
                    name="status"
                    value="REJECTED"
                    className="focus min-h-11 border border-rule bg-paper px-5 text-sm font-bold"
                  >
                    Reject
                  </button>
                </form>
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No source documents yet"
          body="Run scripts/ingest-acts.mjs to extract the Act PDFs. They will appear here for review."
        />
      )}
    </Page>
  );
}
