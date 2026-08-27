import { createHash } from "node:crypto";

/**
 * A stable, non-reversible key for rate limiting an anonymous caller.
 *
 * The raw IP address is never stored: `objection_attempts` holds only this
 * digest, so the attempt log cannot be turned into a record of who looked at
 * which marriage notice. The salt stops the digest being reversed by hashing
 * the (small) space of IPv4 addresses and comparing.
 */
export function clientHash(headers: Headers): string {
  // x-forwarded-for is a client-settable header everywhere except behind a
  // proxy that overwrites it. Vercel does overwrite it; the leftmost entry is
  // the real client. Off Vercel this is spoofable, which weakens the limit but
  // does not break anything else — noted rather than silently assumed.
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip") || "unknown";
  const agent = headers.get("user-agent") ?? "unknown";
  const salt = process.env.OBJECTION_SALT ?? "marreg-unsalted-development-only";
  return createHash("sha256").update(`${salt}|${ip}|${agent}`).digest("hex").slice(0, 32);
}
