"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ACTS, ACT_CODES, type ActCode } from "../lib/acts";
import type { AssistantAnswer, Passage } from "../lib/assistant/types";
import { Alert, Field } from "./ui";

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

const SUGGESTIONS = [
  "What documents do I need for registration?",
  "How long is the notice period under the Special Marriage Act?",
  "How many witnesses must attend?",
  "Who can object to a marriage, and when?",
];

function nextStep(question: string, locale: string) {
  const q = question.toLowerCase();
  if (/status|track|application number|check my/.test(q)) return { label: "Check application status", href: `/${locale}/status` };
  if (/office|officer|registrar|near|district|address|phone|contact/.test(q)) return { label: "Find a marriage office", href: `/${locale}/offices` };
  if (/apply|application|register|registration|document|proof|witness|notice/.test(q)) return { label: "See requirements and apply", href: `/${locale}/acts` };
  if (/fee|payment|pay|cost|charge/.test(q)) return { label: "View fees and payments", href: `/${locale}/fees` };
  if (/object|correct|complaint|error/.test(q)) return { label: "Open corrections and objections", href: `/${locale}/objections` };
  return { label: "Browse registration guidance", href: `/${locale}/help` };
}

function Sources({ passages, locale }: { passages: Passage[]; locale: string }) {
  if (!passages.length) return null;
  return (
    <div className="mt-5 border-t border-rule pt-4">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">Sources</p>
      <ol className="mt-3 space-y-3">
        {passages.map((p) => (
          <li key={p.index} className="text-sm leading-6">
            <span className="font-bold">[{p.index}] {p.heading}</span>
            <span className="block text-[var(--muted)]">
              {p.citation}
              {p.page ? `, page ${p.page}` : ""}
            </span>
            {p.href && (
              <Link href={p.href} className="focus text-teal underline underline-offset-4">
                Read the full record →
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

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setTurns((t) => [...t, { question: trimmed, answer: null }]);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, act: act || null, locale }),
      });
      const json = await res.json();

      setTurns((t) => {
        const next = [...t];
        const last = next[next.length - 1];
        // A refusal is a real answer the citizen must see, and the service
        // returns one with a 503 when it is the service that failed. Only a
        // response carrying no refusal at all is an error to report as such.
        if (res.ok || json?.refusal) last.answer = json as AssistantAnswer;
        else last.error = json?.error ?? "Something went wrong. Try again.";
        return next;
      });
    } catch {
      setTurns((t) => {
        const next = [...t];
        next[next.length - 1].error = "Could not reach the assistant. Check your connection.";
        return next;
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-10">
      <Alert tone="info">
        This assistant answers only from the marriage Acts and the office directory that registry
        staff have verified. It cannot decide your case, and it is not legal advice. Only the
        Marriage Officer can decide whether a marriage may be registered.
      </Alert>

      <div className="mt-8 space-y-6">
        {turns.map((turn, i) => (
          <div key={i} className="border border-rule bg-surface">
            <p className="border-b border-rule bg-paper px-5 py-4 text-sm font-bold">{turn.question}</p>
            <div className="px-5 py-5">
              {turn.error && <p className="text-sm leading-6 text-[#8a2b2b]">{turn.error}</p>}

              {!turn.answer && !turn.error && (
                <p className="text-sm leading-6 text-[var(--muted)]">Searching the approved sources…</p>
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
                  <Link
                    href={nextStep(turn.question, locale).href}
                    className="focus mt-5 inline-flex min-h-11 items-center bg-saffron px-4 text-sm font-bold"
                  >
                    {nextStep(turn.question, locale).label} <span className="ml-2" aria-hidden="true">→</span>
                  </Link>
                  <Sources passages={turn.answer.passages} locale={locale} />
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
        <Field label="Your question">
          <input
            ref={inputRef}
            name="question"
            maxLength={500}
            placeholder="e.g. How many days after the notice can we marry?"
            className="mt-2 min-h-12 w-full border border-rule bg-paper px-4 text-base font-normal"
          />
        </Field>

        <Field
          label="Act (optional)"
          className="mt-5"
          hint="Narrows the answer to one law. Leave blank to search all of them."
        >
          <select
            value={act}
            onChange={(e) => setAct(e.target.value as ActCode | "")}
            className="mt-2 min-h-12 w-full border border-rule bg-paper px-4 text-base font-normal"
          >
            <option value="">All Acts</option>
            {ACT_CODES.map((code) => (
              <option key={code} value={code}>{ACTS[code].label}</option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="focus mt-6 min-h-12 border border-ink bg-ink px-6 text-sm font-bold text-paper disabled:opacity-50"
        >
          {pending ? "Searching…" : "Ask"}
        </button>
      </form>

      {turns.length === 0 && (
        <div className="mt-8">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">Try asking</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                className="focus border border-rule bg-surface px-4 py-2 text-left text-sm"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
