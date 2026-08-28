import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActCode } from "../acts";
import type { Passage } from "./types";

/**
 * Everything the assistant is allowed to know.
 *
 * Both queries run through the caller's own Supabase client, not the service
 * role, so row-level security decides what comes back. That is deliberate and
 * load-bearing: `search_knowledge` and `search_offices` are both SECURITY
 * INVOKER, so a source document or an office that no human has verified is
 * unreachable from here. The assistant cannot leak an unapproved record
 * because it cannot read one.
 */

type KnowledgeRow = {
  chunk_id: string;
  source_id: string;
  title: string;
  citation: string;
  acts: ActCode[] | null;
  heading: string | null;
  body: string;
  page: number | null;
};

type OfficeRow = {
  id: string;
  name: string | null;
  officer_name: string | null;
  designation: string | null;
  address: string | null;
  police_station: string | null;
  district_code: string | null;
  pincode: string | null;
  phones: string[] | null;
  acts: ActCode[] | null;
  source_document: string | null;
};

/** Words that carry no signal in a statutory corpus, where every section says "marriage". */
const NOISE = new Set([
  "the", "a", "an", "of", "to", "in", "for", "is", "are", "do", "does", "i", "my", "me",
  "what", "how", "when", "where", "can", "should", "need", "want", "please", "and", "or",
  "marriage", "married", "act", "india", "west", "bengal",
]);

/**
 * Turn a natural question into a tsquery-safe string.
 *
 * websearch_to_tsquery accepts free text, but a full sentence ANDs every term
 * and returns nothing. Dropping filler and the corpus-wide words leaves the
 * terms that actually discriminate between sections.
 */
export function searchTerms(question: string): string {
  const words = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NOISE.has(w));

  // OR rather than AND: a citizen's phrasing rarely matches a draftsman's.
  return [...new Set(words)].slice(0, 12).join(" or ");
}

/** Does this question look like it is about finding an office rather than a rule? */
export function asksAboutOffice(question: string): boolean {
  return /\b(office|officer|registrar|address|where|near|nearest|phone|contact|timing|district)\b/i
    .test(question);
}

export async function retrieve(
  supabase: SupabaseClient,
  question: string,
  act: ActCode | null,
  locale: string,
): Promise<Passage[]> {
  const terms = searchTerms(question);
  if (!terms) return [];

  const passages: Passage[] = [];

  const { data: law, error: lawError } = await supabase.rpc("search_knowledge", {
    p_query: terms,
    p_act: act,
    p_limit: 6,
  });
  if (lawError) throw new Error(`search_knowledge failed: ${lawError.message}`);

  for (const row of (law ?? []) as KnowledgeRow[]) {
    passages.push({
      index: passages.length + 1,
      kind: "ACT",
      citation: row.citation,
      heading: row.heading ?? row.title,
      body: row.body,
      page: row.page,
      href: `/${locale}/acts`,
    });
  }

  if (asksAboutOffice(question)) {
    // Only the office search knows about verification status; passing the raw
    // question is right here, because it matches on name, locality and PIN.
    const { data: offices, error: officeError } = await supabase.rpc("search_offices", {
      p_query: question.replace(/[%_]/g, " ").slice(0, 80),
      p_district: null,
      p_act: act,
      p_police_station: null,
      p_pincode: null,
    });
    if (officeError) throw new Error(`search_offices failed: ${officeError.message}`);

    for (const o of ((offices ?? []) as OfficeRow[]).slice(0, 4)) {
      const lines = [
        o.officer_name ? `Officer: ${o.officer_name}` : null,
        o.designation ? `Designation: ${o.designation}` : null,
        o.address ? `Address: ${o.address}` : null,
        o.police_station ? `Police station: ${o.police_station}` : null,
        o.pincode ? `PIN: ${o.pincode}` : null,
        o.phones?.length ? `Phone: ${o.phones.join(", ")}` : null,
      ].filter(Boolean);

      passages.push({
        index: passages.length + 1,
        kind: "OFFICE",
        citation: o.source_document
          ? `Office of the Registrar General of Marriages — ${o.source_document}`
          : "Verified office directory, MARREG",
        heading: o.name ?? "Marriage office",
        body: lines.join("\n"),
        href: `/${locale}/offices`,
      });
    }
  }

  return passages;
}
