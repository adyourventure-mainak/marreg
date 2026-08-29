import { redirect } from "next/navigation";
import { Page } from "../../../../components/Shell";
import { Card, Empty } from "../../../../components/ui";
import { AdminNav } from "../../../../components/AdminNav";
import { createClient, getProfile } from "../../../../lib/supabase/server";
import { isAdmin } from "../../../../lib/admin";
import { matchFaq } from "../../../../lib/assistant/faq";
import type { Profile } from "../../../../lib/types";

export const dynamic = "force-dynamic";

/**
 * What the public actually asked, and what the assistant did about it.
 *
 * This is the evidence behind the FAQ. An entry in faq.ts is a claim that a
 * question is common enough to route by hand; without a list of what was
 * really asked, that claim is a guess. The refusal column is the more useful
 * half: a question asked repeatedly and declined every time is a gap in the
 * corpus, not a citizen asking the wrong thing.
 */

type Row = {
  asked_at: string;
  locale: string;
  question: string;
  answered: boolean;
  refusal_reason: string | null;
};

/** Group by the question itself, lightly normalised, so near-duplicates collapse. */
function key(question: string): string {
  return question.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

export default async function AdminQuestionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const profile = (await getProfile()) as Profile | null;
  if (!profile) redirect(`/${locale}/login?next=/${locale}/admin/questions`);

  if (!isAdmin(profile)) {
    return (
      <Page locale={locale} eyebrow="Administration" title="Restricted area.">
        <Empty title="No access" body="Only the Registrar General's administrators may read the question log."
               action={{ href: `/${locale}`, label: "Back to the portal" }} />
      </Page>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("assistant_queries")
    .select("asked_at, locale, question, answered, refusal_reason")
    .order("asked_at", { ascending: false })
    .limit(2000);
  const rows = (data ?? []) as Row[];

  const groups = new Map<string, { question: string; asked: number; refused: number; bn: number }>();
  for (const r of rows) {
    const k = key(r.question);
    const g = groups.get(k) ?? { question: r.question, asked: 0, refused: 0, bn: 0 };
    g.asked += 1;
    if (!r.answered) g.refused += 1;
    if (r.locale === "bn") g.bn += 1;
    groups.set(k, g);
  }

  const ranked = [...groups.values()].sort((a, b) => b.asked - a.asked || b.refused - a.refused);
  const refusedTotal = rows.filter((r) => !r.answered).length;

  return (
    <Page
      locale={locale}
      eyebrow="Administration"
      title="Questions asked."
      lede="Every question put to the citizen assistant, grouped and ranked. A question asked often and refused often is a gap in the verified corpus — the fix is to verify the source that answers it, not to reword the question."
    >
      <AdminNav locale={locale} current="questions" />

      {rows.length === 0 ? (
        <Empty
          title="No questions logged yet"
          body="Questions appear here as the public uses the assistant. Until there are enough to rank, the curated entries in faq.ts are the starting point rather than a conclusion."
        />
      ) : (
        <>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Questions logged", value: rows.length },
              { label: "Distinct questions", value: groups.size },
              { label: "Declined", value: `${refusedTotal} (${Math.round((refusedTotal / rows.length) * 100)}%)` },
            ].map((s) => (
              <Card key={s.label}>
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">{s.label}</p>
                <p className="mt-2 text-2xl font-bold">{s.value}</p>
              </Card>
            ))}
          </div>

          <div className="mt-6 overflow-x-auto border border-rule">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-surface text-left">
                <tr>
                  {["Question", "Asked", "Declined", "Bengali", "Curated"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, 100).map((g) => {
                  const faq = matchFaq(g.question);
                  return (
                    <tr key={g.question} className="border-t border-rule align-top">
                      <td className="px-4 py-3">{g.question}</td>
                      <td className="px-4 py-3 tabular-nums">{g.asked}</td>
                      <td className={`px-4 py-3 tabular-nums ${g.refused ? "text-saffron font-bold" : ""}`}>{g.refused}</td>
                      <td className="px-4 py-3 tabular-nums">{g.bn}</td>
                      <td className="px-4 py-3 text-[var(--muted)]">{faq ? faq.id : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Page>
  );
}
