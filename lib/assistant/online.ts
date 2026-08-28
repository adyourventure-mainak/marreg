import type { Passage } from "./types";

const SOURCES = [
  { title: "West Bengal MARREG portal", url: "https://rgmwb.gov.in/MARREG_Portal/MARREG_Home.aspx", terms: ["register", "registration", "certificate", "online"] },
  { title: "West Bengal registration service", url: "https://wbregistration.gov.in/%28S%28x0zlsd24racxad5r25302zkf%29%29/marriage_regs.aspx", terms: ["register", "registration", "process", "marriage"] },
  { title: "India Code", url: "https://www.indiacode.nic.in/indiacode/handle/123456789/1387?view_type=browse", terms: ["act", "notice", "officer", "objection", "witness"] },
  { title: "West Bengal e-Services", url: "https://wb.gov.in/e-services.aspx", terms: ["service", "apply", "application", "certificate"] },
] as const;

function clean(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export async function searchOfficialSources(question: string, locale: string): Promise<Passage[]> {
  const q = question.toLowerCase();
  const selected = SOURCES.filter((source) => source.terms.some((term) => q.includes(term)));
  const results = await Promise.all(selected.slice(0, 2).map(async (source) => {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(4500), headers: { accept: "text/html" } });
      if (!response.ok) return null;
      const text = clean(await response.text());
      const hit = q.split(/\s+/).find((word) => word.length > 3 && text.toLowerCase().includes(word));
      if (!hit) return null;
      const index = text.toLowerCase().indexOf(hit);
      return { kind: "ONLINE" as const, citation: source.title, heading: "Official government source", body: text.slice(Math.max(0, index - 180), index + 900), href: source.url };
    } catch { return null; }
  }));
  return results.filter(Boolean).map((passage, index) => ({ ...passage!, index: index + 1 }));
}
