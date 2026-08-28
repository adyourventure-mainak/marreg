"use client";

import { useState } from "react";
import { CitizenAssistant } from "./CitizenAssistant";

export function LandingChat({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Open the marriage registration chatbot" className="focus group relative mx-auto mt-10 block w-full max-w-2xl overflow-hidden rounded-[2rem] border-2 border-[var(--marreg-pink)] bg-white shadow-[0_20px_55px_rgba(184,50,106,.2)] transition hover:scale-[1.01] hover:shadow-[0_24px_65px_rgba(184,50,106,.35)] md:mt-14">
        <img src="/images/lovebirds-chatbot.jpg" alt="Two lovebirds sitting together" className="h-auto w-full" />
        <span className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-marreg-pink px-5 py-3 text-xs font-bold uppercase tracking-[.14em] text-white shadow-lg transition group-hover:bg-marreg-pink-dark">Click to ask a question ↓</span>
      </button>
      {open && <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Marriage registration chatbot">
        <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto border border-ink bg-paper p-5 shadow-2xl sm:p-8">
          <div className="flex items-center justify-between gap-4"><h2 className="font-display text-3xl">Ask about registration</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close chatbot" className="focus h-10 w-10 border border-rule text-2xl">×</button></div>
          <CitizenAssistant locale={locale} />
        </div>
      </div>}
    </>
  );
}
