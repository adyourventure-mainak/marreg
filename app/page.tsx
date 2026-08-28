import Link from "next/link";
import { FloatingAssistant } from "../components/FloatingAssistant";
import { Footer } from "../components/Shell";

export default function RootPage() {
  return (
    <main className="min-h-screen bg-paper">
      <section className="page py-16 md:py-24">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">MARREG · West Bengal</p>
        <h1 className="mt-5 max-w-3xl text-5xl leading-[.98] md:text-7xl">How can we help with your marriage registration?</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">
          Ask a question in your own words. The assistant will explain the approved information and guide you to the right service.
        </p>
        <Link href="#question-section" aria-label="Open the marriage registration question section" className="focus group relative mx-auto mt-10 block max-w-2xl overflow-hidden rounded-[2rem] bg-marreg-pink px-8 py-8 shadow-[0_20px_55px_rgba(184,50,106,.25)] transition hover:scale-[1.01] hover:shadow-[0_24px_65px_rgba(184,50,106,.35)] md:mt-14 md:px-16">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10" />
          <svg viewBox="0 0 640 310" role="img" aria-label="Animated married couple illustration" className="relative mx-auto h-auto w-full">
            <style>{`.couple{animation:float 4s ease-in-out infinite}.spark{animation:twinkle 2s ease-in-out infinite alternate}@keyframes float{50%{transform:translateY(-7px)}}@keyframes twinkle{to{opacity:.35;transform:scale(.7)}}`}</style>
            <g className="couple" fill="none" stroke="#fffdf8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="7">
              <path d="M175 270c5-74 28-112 77-112s75 38 80 112M308 270c6-72 31-112 79-112s73 40 78 112" />
              <circle cx="253" cy="106" r="38" fill="#f7e5c5" /><circle cx="388" cy="106" r="38" fill="#f7e5c5" />
              <path d="M217 101c7-49 69-54 78-2M352 101c10-46 67-45 74 0M241 117h2M266 117h2M376 117h2M401 117h2" />
              <path d="M245 139c10 9 22 9 32 0M380 139c10 9 22 9 32 0M293 171l-19 35 36 27 19-28M347 171l20 35-35 27-19-28" />
              <path d="M275 270v-51M411 270v-51M244 270v-42M442 270v-42" />
            </g>
            <g className="spark" fill="#f7e5c5"><path d="M98 88l6 15 15 6-15 6-6 15-6-15-15-6 15-6z" /><path d="M530 72l5 12 12 5-12 5-5 12-5-12-12-5 12-5z" /></g>
            <path d="M260 270h130" stroke="#f7e5c5" strokeWidth="5" strokeLinecap="round" />
          </svg>
          <span className="relative mt-2 block text-center text-xs font-bold uppercase tracking-[.18em] text-white/90 transition group-hover:text-white">Click to ask a question ↓</span>
        </Link>
        <FloatingAssistant locale="en" />
      </section>
      <Footer locale="en" />
    </main>
  );
}
