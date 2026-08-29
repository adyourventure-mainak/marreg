const VIDEOS = [
  { title: "How to fill the registration form", query: "West Bengal marriage registration form fill up" },
  { title: "Online marriage registration steps", query: "West Bengal marriage registration online procedure" },
  { title: "Documents and witnesses", query: "West Bengal marriage registration documents witnesses" },
] as const;

export function VideoGuides() {
  return (
    <section id="video-guides" className="mt-12 border border-rule bg-surface p-6 md:p-8">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-teal">Video guides</p>
      <h2 className="mt-3 text-3xl">See how the process works.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
        These YouTube searches help you find visual walkthroughs. Check every video against the official rules and service pages below before submitting an application.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {VIDEOS.map((video) => (
          <a key={video.query} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(video.query)}`} target="_blank" rel="noreferrer" className="focus border border-rule bg-paper p-5 transition hover:border-teal">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-marreg-pink text-lg text-white">▶</span>
            <h3 className="mt-4 text-xl">{video.title}</h3>
            <span className="mt-5 inline-block border-b-2 border-saffron pb-1 text-sm font-bold text-teal">Watch on YouTube →</span>
          </a>
        ))}
      </div>
      <div className="mt-6 border-t border-rule pt-5 text-sm leading-6">
        <strong>Verify before you apply:</strong>{" "}
        <a className="focus text-teal underline" href="https://rgmwb.gov.in/MARREG_Portal/MARREG_Home.aspx" target="_blank" rel="noreferrer">official MARREG portal</a>
        {" · "}
        <a className="focus text-teal underline" href="https://wbregistration.gov.in/marriage_regs.aspx" target="_blank" rel="noreferrer">West Bengal registration service</a>
      </div>
    </section>
  );
}
