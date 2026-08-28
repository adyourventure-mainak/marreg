import { CitizenAssistant } from "../components/CitizenAssistant";
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
        <CitizenAssistant locale="en" />
      </section>
      <Footer locale="en" />
    </main>
  );
}
