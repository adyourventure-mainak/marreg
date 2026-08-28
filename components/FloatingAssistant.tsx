"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CitizenAssistant } from "./CitizenAssistant";

export function FloatingAssistant({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("FloatingAssistant");

  return (
    <div className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-3 sm:bottom-7 sm:right-7">
      {open && (
        <section
          aria-label="Registry assistant chat"
          className="max-h-[calc(100vh-7rem)] w-[min(92vw,30rem)] max-w-[30rem] overflow-y-auto border border-ink bg-paper p-5 shadow-[0_18px_50px_rgba(23,33,31,.22)] sm:p-6"
        >
          <div className="flex items-start justify-between gap-5 border-b border-rule pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">{t("eyebrow")}</p>
              <h2 className="mt-2 font-display text-2xl">{t("heading")}</h2>
            </div>
            <button
              type="button"
              aria-label={t("close")}
              onClick={() => setOpen(false)}
              className="focus flex h-9 w-9 shrink-0 items-center justify-center border border-rule text-xl leading-none"
            >
              ×
            </button>
          </div>
          <CitizenAssistant locale={locale} />
        </section>
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? t("close") : t("open")}
        onClick={() => setOpen((value) => !value)}
        className="group focus relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-paper bg-teal text-paper shadow-[0_8px_24px_rgba(23,33,31,.28)] transition hover:scale-105 hover:bg-ink"
      >
        {!open && <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-saffron opacity-30" />}
        {open ? (
          <span className="text-3xl leading-none" aria-hidden="true">×</span>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current" strokeWidth="1.8">
            <path d="M5 6.5h14v9H9l-4 3v-12Z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 10h8M8 13h5" strokeLinecap="round" />
          </svg>
        )}
        <span className="sr-only">{open ? t("closeShort") : t("askShort")}</span>
      </button>
    </div>
  );
}
