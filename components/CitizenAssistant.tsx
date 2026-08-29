"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ACT_CODES, type ActCode } from "../lib/acts";
import type { AssistantAnswer, Passage } from "../lib/assistant/types";
import { Alert, Field } from "./ui";
import { NearMeButton } from "./NearMeButton";

/**
 * The citizen assistant.
 *
 * The sources are shown alongside every answer, never folded away behind a
 * disclosure. A person acting on what this says should be able to read the
 * section it came from without deciding to go looking for it.
 */

type Turn = {
  question: string;
  answer: AssistantAnswer | null;
  error?: string;
};

const SUGGESTIONS = ["documents", "notice", "witnesses", "objection"] as const;

/**
 * Where to send the citizen after an answer, matched on what they asked.
 *
 * Both scripts are matched. Bengali writes its vowels as combining marks and
 * has no Latin word boundary, so the Bengali side is plain substrings rather
 * than `\b`-delimited alternatives — the same reason `asksAboutOffice` in the
 * retrieval layer matches that way. Without these a Bengali question matched
 * nothing and every answer ended on the generic guidance link.
 */
const ROUTES = [
  { key: "status", path: "status", en: /status|track|application number|check my/, bn: ["অবস্থা", "ট্র্যাক", "আবেদন নম্বর"] },
  { key: "offices", path: "offices", en: /office|officer|registrar|near|district|address|phone|contact/, bn: ["অফিস", "কার্যালয়", "অফিসার", "রেজিস্ট্রার", "নিবন্ধক", "ঠিকানা", "জেলা", "ফোন", "কোথায়", "কাছে"] },
  { key: "acts", path: "acts", en: /apply|application|register|registration|document|proof|witness|notice/, bn: ["আবেদন", "নিবন্ধন", "নথি", "প্রমাণ", "সাক্ষী", "নোটিশ"] },
  { key: "fees", path: "fees", en: /fee|payment|pay|cost|charge/, bn: ["ফি", "খরচ", "অর্থপ্রদান", "টাকা", "মূল্য"] },
  { key: "objections", path: "objections", en: /object|correct|complaint|error/, bn: ["আপত্তি", "সংশোধন", "অভিযোগ", "ভুল"] },
] as const;

export function nextStepKey(question: string): string {
  const q = question.toLowerCase();
  const hit = ROUTES.find((r) => r.en.test(q) || r.bn.some((term) => question.includes(term)));
  return hit ? hit.key : "help";
}

const pathFor = (key: string) => ROUTES.find((r) => r.key === key)?.path ?? "help";

function Sources({ passages }: { passages: Passage[] }) {
  const t = useTranslations("Assistant");
  if (!passages.length) return null;
  return (
    <div className="mt-5 border-t border-rule pt-4">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">{t("sources")}</p>
      <ol className="mt-3 space-y-3">
        {passages.map((p) => (
          <li key={p.index} className="text-sm leading-6">
            <span className="font-bold">[{p.index}] {p.heading}</span>
            <span className="block text-[var(--muted)]">
              {p.citation}
              {p.page ? t("page", { page: p.page }) : ""}
            </span>
            {p.href && (
              <Link href={p.href} className="focus text-teal underline underline-offset-4">
                {t("readRecord")} <span aria-hidden="true">→</span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CitizenAssistant({ locale }: { locale: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [act, setAct] = useState<ActCode | "">("");
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("Assistant");
  const ta = useTranslations("Acts");

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setTurns((prev) => [...prev, { question: trimmed, answer: null }]);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, act: act || null, locale }),
      });
      const json = await res.json();

      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        // A refusal is a real answer the citizen must see, and the service
        // returns one with a 503 when it is the service that failed. Only a
        // response carrying no refusal at all is an error to report as such.
        if (res.ok || json?.refusal) last.answer = json as AssistantAnswer;
        else last.error = json?.error ?? t("genericError");
        return next;
      });
    } catch {
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1].error = t("networkError");
        return next;
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-10">
      <Alert tone="info">{t("disclaimer")}</Alert>

      <div className="mt-8 space-y-6">
        {turns.map((turn, i) => (
          <div key={i} className="border border-rule bg-surface">
            <p className="border-b border-rule bg-paper px-5 py-4 text-sm font-bold">{turn.question}</p>
            <div className="px-5 py-5">
              {turn.error && <p className="text-sm leading-6 text-[#8a2b2b]">{turn.error}</p>}

              {!turn.answer && !turn.error && (
                <p className="text-sm leading-6 text-[var(--muted)]">{t("searching")}</p>
              )}

              {turn.answer && (
                <>
                  {turn.answer.answered ? (
                    turn.answer.text.split(/\n{2,}/).map((para, k) => (
                      <p key={k} className="mt-3 text-sm leading-7 first:mt-0">{para}</p>
                    ))
                  ) : (
                    <p className="text-sm leading-7">{turn.answer.refusal}</p>
                  )}
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Link
                      href={`/${locale}/${pathFor(nextStepKey(turn.question))}`}
                      className="focus inline-flex min-h-11 items-center bg-saffron px-4 text-sm font-bold"
                    >
                      {t(`nextStep.${nextStepKey(turn.question)}`)} <span className="ml-2" aria-hidden="true">→</span>
                    </Link>
                    {/* Asked for the nearest office without saying where they are:
                        offer the browser's own answer rather than making them
                        guess which district they should have named. */}
                    {turn.answer.needsLocation && <NearMeButton locale={locale} />}
                  </div>
                  <Sources passages={turn.answer.passages} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          const value = inputRef.current?.value ?? "";
          if (inputRef.current) inputRef.current.value = "";
          void ask(value);
        }}
      >
        <Field label={t("questionLabel")}>
          <input
            ref={inputRef}
            name="question"
            maxLength={500}
            placeholder={t("questionPlaceholder")}
            className="mt-2 min-h-12 w-full border border-rule bg-paper px-4 text-base font-normal"
          />
        </Field>

        <Field
          label={t("actLabel")}
          className="mt-5"
          hint={t("actHint")}
        >
          <select
            value={act}
            onChange={(e) => setAct(e.target.value as ActCode | "")}
            className="mt-2 min-h-12 w-full border border-rule bg-paper px-4 text-base font-normal"
          >
            <option value="">{t("allActs")}</option>
            {ACT_CODES.map((code) => (
              <option key={code} value={code}>{ta(`rules.${code}.label`)}</option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="focus mt-6 min-h-12 border border-ink bg-ink px-6 text-sm font-bold text-paper disabled:opacity-50"
        >
          {pending ? t("asking") : t("ask")}
        </button>
      </form>

      {turns.length === 0 && (
        <div className="mt-8">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">{t("tryAsking")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => void ask(t(`suggestions.${key}`))}
                className="focus border border-rule bg-surface px-4 py-2 text-left text-sm"
              >
                {t(`suggestions.${key}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
