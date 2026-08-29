import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActCode } from "../acts";
import type { Passage } from "./types";
import { searchOfficialSources } from "./online";
import { bridgeBengali, hasBengali } from "./glossary";
import { matchFaq } from "./faq";

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
  // The corpus is English. A Bengali question matches nothing in it, so the
  // statute's own words are substituted before the query is built -- see
  // glossary.ts. English questions pass through this untouched.
  const source = hasBengali(question) ? bridgeBengali(question) : question;

  const words = source
    .toLowerCase()
    // \p{M} keeps combining marks. Bengali writes its vowels as marks on the
    // consonant, so dropping them does not tidy a word, it shatters it:
    // "কলকাতার" became "কলক" and shorter words vanished under the length
    // filter, which is why a Bengali question retrieved nothing at all.
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NOISE.has(w));

  // OR rather than AND: a citizen's phrasing rarely matches a draftsman's.
  return [...new Set(words)].slice(0, 12).join(" or ");
}

/** Does this question look like it is about finding an office rather than a rule? */
export function asksAboutOffice(question: string): boolean {
  if (/\b(office|officer|registrar|address|where|near|nearest|phone|contact|timing|district)\b/i
    .test(question)) return true;
  // The Bengali half of a bilingual service. \b is a Latin word boundary and
  // matches nothing useful in Bengali script, so these are plain substrings.
  return BENGALI_OFFICE.some((term) => question.includes(term));
}

/** Office, officer, registrar, address, district, phone, where, near. */
const BENGALI_OFFICE = [
  "অফিস", "কার্যালয়", "নিবন্ধক", "রেজিস্ট্রার", "অফিসার",
  "ঠিকানা", "জেলা", "ফোন", "যোগাযোগ", "কোথায়", "কাছে", "নিকট",
];

/** A six-digit PIN code mentioned in the question, if there is one. */
export function pincodeIn(question: string): string | null {
  return /(?<!\d)(\d{6})(?!\d)/.exec(question)?.[1] ?? null;
}

/**
 * Words that describe the *act* of looking for an office, not the place.
 *
 * search_offices matches p_query as a substring against the office's own
 * fields, so these can never appear in one: no address contains "nearest" and
 * no officer is called "contact". Feeding them to the search is not merely
 * useless, it is the reason a question with no district returned nothing.
 */
const OFFICE_NOISE = new Set([
  "office", "offices", "officer", "officers", "registrar", "register", "registry", "registration",
  "marriage", "near", "nearest", "nearby", "closest", "close", "around", "here",
  "address", "phone", "number", "contact", "timing", "timings", "hours", "open",
  "find", "search", "look", "looking", "get", "give", "tell", "show", "know",
  "district", "location", "place", "area", "list", "details", "detail", "info",
  "information", "who", "whom", "which", "there", "from", "with", "about",
]);

/**
 * The parts of a question that could name a place, an office or an officer.
 *
 * Returned as separate terms rather than one string. This is the whole bug the
 * screenshot showed: searchTerms() OR-joins its words for websearch_to_tsquery,
 * but search_offices does `ilike '%' || p_query || '%'`, so the joined string
 * "nearest or officer" was looked up literally and matched no row in the
 * register — every office question that named no district silently found
 * nothing and the assistant reported that as an absence of records.
 */
export function officeTerms(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    // Bengali script is dropped: the register is written in English, so a
    // Bengali token can only ever ILIKE-match nothing. A district named in
    // Bengali is still recognised — districtCodeIn() matches it against
    // districts.name_bn and passes a real code instead.
    .filter((w) => w.length > 2 && !hasBengali(w) && !NOISE.has(w) && !OFFICE_NOISE.has(w));
  return [...new Set(words)].slice(0, 3);
}

/**
 * Does the question depend on where the citizen is, without saying where?
 *
 * "Nearest marriage officer" names no district, no PIN and no locality, so
 * there is nothing to search on. Answering it with "I have no verified office
 * record" is false: the register holds 587 of them. The honest reply is that
 * we do not know where they are, which is what NEEDS_LOCATION says — and the
 * site can then offer to ask the browser.
 */
export function needsLocation(question: string): boolean {
  const proximity = /\b(near|nearest|nearby|closest|close to me|around me|my area)\b/i.test(question)
    || ["কাছে", "নিকট", "কাছাকাছি"].some((t) => question.includes(t));
  return proximity && !pincodeIn(question);
}

/**
 * Resolve a district the citizen named to its code.
 *
 * search_offices matches its free-text argument with a substring ILIKE against
 * the concatenated office fields, so handing it a whole question can only ever
 * return nothing -- "Where is the marriage office in Alipurduar?" is not a
 * substring of any address. Testing found exactly that: a question naming a
 * district retrieved no office at all.
 *
 * So the district is resolved to its code first and passed as a real filter.
 * Matching is on the names in the districts table, English and Bengali, rather
 * than on a list written here, so a district cannot be recognised under a name
 * the register does not use.
 */
export function districtCodeIn(
  question: string,
  districts: { code: string; name: string; name_bn: string | null }[],
): string | null {
  const haystack = question.toLowerCase();
  // Longest name first, so "North 24 Parganas" wins over a shorter substring.
  const sorted = [...districts].sort((a, b) => b.name.length - a.name.length);
  for (const d of sorted) {
    if (haystack.includes(d.name.toLowerCase())) return d.code;
    if (d.name_bn && question.includes(d.name_bn)) return d.code;
  }
  return null;
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

  // The common questions go straight to the sections that answer them, rather
  // than depending on rank to put them first -- see faq.ts. This reads through
  // the same RLS-guarded tables, so an entry naming a section from a source no
  // human has verified retrieves nothing, exactly as a search would.
  const faq = matchFaq(question, act);
  let law: KnowledgeRow[] | null = null;

  if (faq) {
    const { data, error } = await supabase
      .from("knowledge_chunks")
      .select("id, source_id, heading, body, page, knowledge_sources!inner(id, title, citation, acts)")
      .in("heading", faq.sections);
    if (error) throw new Error(`faq lookup failed: ${error.message}`);

    const rows = (data ?? []) as unknown as (Omit<KnowledgeRow, "chunk_id" | "title" | "citation" | "acts"> & {
      id: string;
      knowledge_sources: { id: string; title: string; citation: string; acts: ActCode[] | null };
    })[];

    // Keep the curated order, so the section that answers the question leads.
    const rank = new Map(faq.sections.map((h, i) => [h.toLowerCase(), i]));
    law = rows
      .sort((a, b) => (rank.get((a.heading ?? "").toLowerCase()) ?? 99) - (rank.get((b.heading ?? "").toLowerCase()) ?? 99))
      .map((r) => ({
        chunk_id: r.id,
        source_id: r.knowledge_sources.id,
        title: r.knowledge_sources.title,
        citation: r.knowledge_sources.citation,
        acts: r.knowledge_sources.acts,
        heading: r.heading,
        body: r.body,
        page: r.page,
      }));
  }

  // No curated entry, or one whose sources are not public yet: search as usual.
  if (!law || law.length === 0) {
    const { data, error: lawError } = await supabase.rpc("search_knowledge", {
      p_query: terms,
      p_act: act,
      p_limit: 6,
    });
    if (lawError) throw new Error(`search_knowledge failed: ${lawError.message}`);
    law = (data ?? []) as KnowledgeRow[];
  }

  for (const row of law) {
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

  if (passages.length === 0) passages.push(...await searchOfficialSources(question, locale));

  if (asksAboutOffice(question)) {
    const { data: districts } = await supabase.from("districts").select("code, name, name_bn");
    const district = districtCodeIn(question, districts ?? []);
    const pincode = pincodeIn(question);

    // A place the citizen named beats a free-text guess, so the query term is
    // only used when neither filter applies.
    // Nothing to go on but "near me": searching on the leftover words would
    // ask the register for offices called "my", so let the near-me flow answer
    // it instead.
    const blind = needsLocation(question) && !district && !pincode;
    const terms = district || pincode || blind ? [] : officeTerms(question);
    const found = new Map<string, OfficeRow>();

    // Each term is searched on its own and the results unioned. A single
    // combined string would AND the words inside one ILIKE, so "Alipurduar
    // court" would need both to sit adjacent in the same field.
    const queries = terms.length ? terms : [null];
    for (const term of queries) {
      // Nothing to search on at all: no district, no PIN, no place name. Do
      // not run a query that can only return the whole register.
      if (term === null && !district && !pincode) break;

      const { data: offices, error: officeError } = await supabase.rpc("search_offices", {
        p_query: term,
        p_district: district,
        p_act: act,
        p_police_station: null,
        p_pincode: pincode,
      });
      if (officeError) throw new Error(`search_offices failed: ${officeError.message}`);
      for (const o of (offices ?? []) as OfficeRow[]) if (!found.has(o.id)) found.set(o.id, o);
    }

    for (const o of [...found.values()].slice(0, 4)) {
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
        // The register spells the officer's name the way the department's PDF
        // does. Whatever the model writes, that spelling is what is shown.
        verbatim: o.officer_name ? [o.officer_name] : [],
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
