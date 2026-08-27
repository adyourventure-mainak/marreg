import { describe, it, expect } from "vitest";
import { clientHash } from "./client-hash";

const h = (init: Record<string, string>) => clientHash(new Headers(init));

describe("clientHash", () => {
  it("is stable for the same caller", () => {
    const a = h({ "x-forwarded-for": "203.0.113.7", "user-agent": "Firefox" });
    const b = h({ "x-forwarded-for": "203.0.113.7", "user-agent": "Firefox" });
    expect(a).toBe(b);
  });

  it("separates different addresses", () => {
    expect(h({ "x-forwarded-for": "203.0.113.7" })).not.toBe(h({ "x-forwarded-for": "203.0.113.8" }));
  });

  it("takes the leftmost forwarded address, not the proxy's", () => {
    // A proxy appends its own address; the rightmost entries are infrastructure
    // and would collapse every visitor onto one bucket.
    const viaProxy = h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2", "user-agent": "UA" });
    const direct = h({ "x-forwarded-for": "203.0.113.7", "user-agent": "UA" });
    expect(viaProxy).toBe(direct);
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(h({ "x-real-ip": "203.0.113.9" })).not.toBe(h({}));
    expect(h({})).toBe(h({}));
  });

  it("never contains the address it was built from", () => {
    expect(h({ "x-forwarded-for": "203.0.113.7" })).not.toContain("203.0.113.7");
  });

  it("is a fixed-width hex digest", () => {
    expect(h({ "x-forwarded-for": "203.0.113.7" })).toMatch(/^[0-9a-f]{32}$/);
    expect(h({})).toMatch(/^[0-9a-f]{32}$/);
  });

  it("changes with the salt, so the digest cannot be precomputed across deployments", () => {
    const before = h({ "x-forwarded-for": "203.0.113.7" });
    process.env.OBJECTION_SALT = "a-different-salt";
    const after = h({ "x-forwarded-for": "203.0.113.7" });
    delete process.env.OBJECTION_SALT;
    expect(after).not.toBe(before);
  });
});
