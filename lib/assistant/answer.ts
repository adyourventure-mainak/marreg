import { AI_BASE_URL, AI_MODEL, aiConfigured } from "../extraction/provider";
import type { AssistantAnswer, Passage } from "./types";

/**
 * Composes an answer from retrieved passages — and refuses when it cannot.
 *
 * The model here is a writer, not a source. It is given numbered passages and
 * told to use nothing else. Three things enforce that, in descending order of
 * how much they can be trusted:
 *
 *   1. No passages, no model call. A question the corpus cannot support is
 *      declined in code, before a token is spent. This is the guarantee that
 *      actually holds, because it does not depend on the model.
 *   2. The prompt forbids legal conclusions and unsourced facts.
 *   3. The reply is checked afterwards for citations to passages that were
 *      never supplied, and rejected if it invents one.
 *
 * The citizen always sees the passages themselves alongside the answer, so the
 * prose is never the only thing they have to go on.
 */

const AI_API_KEY = process.env.AI_API_KEY ?? "";

const SYSTEM = `You answer questions from members of the public about marriage registration in West Bengal, India, for MARREG — the online service of the Office of the Registrar General of Marriages.

You will be given numbered passages. They are the only information you have. They are extracts from Indian marriage law and records from the verified office directory, both already checked by registry staff.

Absolute rules:
- Use ONLY the numbered passages. If they do not answer the question, say so plainly and suggest what the person can do next. Never fill a gap from your own knowledge.
- Cite every factual sentence with the passage number in square brackets, like [2]. A sentence with no passage behind it must not be written. The passage you cite must actually state what the sentence says — do not attach a number to a claim the passage does not make. If no passage states a rule, say the rule is not in the sources rather than citing something close to it.
- Never give a legal decision or a prediction. Do not tell anyone whether their marriage is valid, whether they are eligible, whether an objection will succeed, or what a court or officer will decide. Explain what the law says and refer them to the Marriage Officer, who is the person empowered to decide.
- Office details — an officer's name, address, telephone number or working hours — come from passages marked as office records. When one is present, give it, copied exactly as written. When none is present, say you do not have a verified office for that place and point the person to Find a Marriage Officer on this site. Never state such a detail, or a fee, date or time limit, that is not printed in a passage.
- This service covers India, and West Bengal in particular. If the question is about another country's law, say that you only cover Indian marriage law.
- Do not ask for or repeat identity numbers, and do not request personal documents.

Style: plain English a person without a lawyer can follow. Short paragraphs. No more than about 180 words. Quote the exact statutory words when a period or a requirement turns on them.

Close with one line telling the person that this is general information and that only the Marriage Officer can decide their case.`;

/** Shown when there is nothing approved to answer from. Deliberately not model output. */
export const NO_SOURCE =
  "I could not find this in the approved sources I am allowed to use — the marriage Acts and the verified office directory. " +
  "Try naming the Act you are applying under, or contact your Marriage Office directly. " +
  "I only answer from records that registry staff have already checked, so I would rather say nothing than guess.";

export const NOT_CONFIGURED =
  "The assistant is not available at the moment. The guides and the office directory on this site have the same information.";

function prompt(question: string, passages: Passage[]): string {
  const body = passages
    .map((p) => {
      const where = p.page ? ` (page ${p.page})` : "";
      // Label the kind, so the rule about office details has something to
      // attach to. Without it the model treated a verified office record as
      // just more statute and refused to give out the address it was holding.
      const kind = p.kind === "OFFICE" ? "OFFICE RECORD" : "LAW";
      return `[${p.index}] (${kind}) ${p.citation} — ${p.heading}${where}\n${p.body}`;
    })
    .join("\n\n");

  return `Passages:\n\n${body}\n\nQuestion from the public: ${question}`;
}

/**
 * Phrases in which the assistant decides the reader's own case.
 *
 * Found by testing, not by imagining. Asked "my wife was 17, is our marriage
 * valid, will the registrar accept it", the model answered with the minimum
 * age -- a rule that was in no retrieved passage -- attributed it to a section
 * about divorce, and predicted what the registrar would do. citesOnly() could
 * not see it: the citation number was in range, so a plausible bracket
 * laundered an unsourced claim into a decision.
 *
 * The lesson is that an in-range citation proves nothing about the sentence
 * attached to it. So the outcome language itself is refused, whatever it
 * cites. This costs some legitimate answers, which is the right trade: the
 * citizen still gets the sections, and a wrong "your marriage is void" is far
 * more expensive to them than a referral to the officer.
 */
const DECIDES_THE_CASE: RegExp[] = [
  /\byour\b[^.?!]{0,40}\b(marriage|application|registration|case)\b[^.?!]{0,40}\b(is|are|was|will|would|may|might|cannot|can)\b[^.?!]{0,40}\b(valid|invalid|void|voidable|illegal|unlawful|accepted|rejected|refused|approved|registered)\b/i,
  /\b(the\s+)?(registrar|marriage officer|officer|court)\b[^.?!]{0,50}\b(will|would|may|might|is likely to|shall)\b[^.?!]{0,30}\b(not\s+)?(accept|reject|refuse|approve|register|allow|grant|deny)\b/i,
  /\byou\b[^.?!]{0,30}\b(are|were|would be|will be|may be|are not|aren't)\b[^.?!]{0,20}\b(eligible|ineligible|entitled|qualified|disqualified|barred)\b/i,
  /\braises? (serious )?questions? about the validity\b/i,
];

/**
 * Does the reply decide, or predict, the reader's own case?
 *
 * Exported so the patterns are testable, because a guard nobody can test is a
 * guard nobody can trust.
 */
export function decidesTheCase(text: string): boolean {
  return DECIDES_THE_CASE.some((re) => re.test(text));
}

/** Shown instead of a decision. The passages are still displayed beside it. */
export const NO_DECISION =
  "I cannot tell you whether this applies to your marriage, or what the Marriage Officer will decide — that decision is theirs alone, and I would be guessing. " +
  "The sections below are the law on the point; read them, and put your situation to your Marriage Office, who can look at your documents. " +
  "If it helps, ask me what a particular section requires and I will explain it.";

/**
 * Reject a reply that cites a passage it was never given.
 *
 * A citation to [7] when six passages were supplied means the model has left
 * the corpus, and everything after that point is unattributable.
 */
export function citesOnly(text: string, passages: Passage[]): boolean {
  const allowed = new Set(passages.map((p) => p.index));
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    if (!allowed.has(Number(m[1]))) return false;
  }
  return true;
}

/**
 * Put the register's own spelling back into the answer.
 *
 * Asked for the Purulia offices, the model returned "Asish Kumar Majee" where
 * the register — and the department's PDF behind it — has "ASISH KUMAR MAJEE".
 * The prompt already said to copy office details exactly; it was ignored, and
 * asking more firmly is not a control.
 *
 * An officer's name is an identifier, so it should reach the citizen in the
 * form the department published. Title-casing is not a neutral tidy-up either:
 * applied to names like "MD.SAHABUDDIN KHAN" or "RANJIT KR. CHATTERJEE" it
 * makes decisions about capitalisation that belong to the person, not to us.
 *
 * This can only move text back towards the source: it rewrites a
 * case-insensitive match of a string the register holds into that exact
 * string, and touches nothing else.
 */
export function restoreVerbatim(text: string, passages: Passage[]): string {
  const exact = passages.flatMap((p) => p.verbatim ?? []).filter(Boolean);
  // Longest first, so a name contained inside a longer one is not part-replaced.
  const ordered = [...new Set(exact)].sort((a, b) => b.length - a.length);

  let out = text;
  for (const value of ordered) {
    const pattern = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(pattern, "gi"), value);
  }
  return out;
}

export type ComposeDeps = {
  /** Injected so the guardrails can be tested without a provider. */
  complete(system: string, user: string, signal?: AbortSignal): Promise<string>;
};

export async function compose(
  question: string,
  passages: Passage[],
  deps: ComposeDeps,
): Promise<AssistantAnswer> {
  if (passages.length === 0) {
    return { answered: false, text: "", passages: [], refusal: NO_SOURCE };
  }

  const text = (await deps.complete(SYSTEM, prompt(question, passages))).trim();

  if (!text) {
    return { answered: false, text: "", passages, refusal: NO_SOURCE };
  }
  if (!citesOnly(text, passages)) {
    return { answered: false, text: "", passages, refusal: NO_SOURCE };
  }
  if (decidesTheCase(text)) {
    return { answered: false, text: "", passages, refusal: NO_DECISION };
  }

  return { answered: true, text: restoreVerbatim(text, passages), passages, model: AI_MODEL };
}

/**
 * The live provider, using the same OpenAI-compatible shape and the same
 * AI_BASE_URL / AI_MODEL / AI_API_KEY as the document extraction worker, so
 * the deployment has one model configuration rather than two.
 */
export const liveProvider: ComposeDeps = {
  async complete(system, user, signal) {
    if (!aiConfigured) throw new Error("AI_API_KEY is not set");

    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0,
        max_tokens: 500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Assistant provider returned ${res.status}: ${detail.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? "";
  },
};
