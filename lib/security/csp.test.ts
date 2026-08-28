import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE = "https://ebgfqwilyspsexgmnpde.supabase.co";

/**
 * `SUPABASE_URL` is read once when its module is first evaluated, so the
 * policy has to be built after the environment is in place rather than
 * imported at the top of the file.
 */
async function policy(): Promise<string> {
  const { contentSecurityPolicy } = await import("./csp");
  return contentSecurityPolicy();
}

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
});

afterEach(() => vi.unstubAllEnvs());

/**
 * A CSP break leaves no server-side trace: the endpoint still answers
 * correctly and the browser silently refuses to act on the answer. These
 * assertions stand in for the console error nobody sees in production.
 */
describe("the sign-in redirect chain survives form-action", () => {
  it("allows every hop the Google button passes through", async () => {
    const formAction = directive(await policy(), "form-action");
    expect(formAction).toContain("'self'");
    // The middle hop. Without it the button is dead in Chrome and Safari
    // while the server keeps returning a valid 303.
    expect(formAction).toContain(SUPABASE);
    expect(formAction).toContain("https://accounts.google.com");
  });

  it("names the hops as separate sources rather than running them together", async () => {
    expect(directive(await policy(), "form-action")).toBe(
      `form-action 'self' ${SUPABASE} https://accounts.google.com`,
    );
  });

  it("stays syntactically valid when no Supabase URL is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.resetModules();
    // Nothing to sign in against without a project URL, so the missing hop is
    // not a defect here — a doubled space that voids the directive would be.
    expect(directive(await policy(), "form-action")).toBe("form-action 'self' https://accounts.google.com");
  });
});

describe("the site's own typefaces load", () => {
  // app/globals.css imports Google Fonts: the stylesheet comes from one host
  // and the font files it names come from another, so both must be allowed.
  it("allows the stylesheet host", async () => {
    expect(directive(await policy(), "style-src")).toContain("https://fonts.googleapis.com");
  });

  it("allows the font-file host", async () => {
    expect(directive(await policy(), "font-src")).toContain("https://fonts.gstatic.com");
  });
});

describe("the controls that are the point of the policy still hold", () => {
  it("permits no third-party script origin", async () => {
    expect(directive(await policy(), "script-src")).toBe("script-src 'self' 'unsafe-inline'");
  });

  it("keeps the plugin, base-tag and framing vectors closed", async () => {
    const csp = await policy();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
