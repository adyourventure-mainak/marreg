import { HttpException, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createHash, randomInt } from "node:crypto";
import { requestOtpSchema, verifyOtpSchema, type RequestOtpInput, type VerifyOtpInput } from "./auth.schemas";

type Challenge = { mobile: string; codeHash: string; attempts: number; expiresAt: number };
@Injectable()
export class AuthService {
  private readonly challenges = new Map<string, Challenge>();
  requestOtp(input: RequestOtpInput): { challengeId: string; expiresInSeconds: number } {
    const parsed = requestOtpSchema.parse(input); const id = randomUUID(); const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.challenges.set(id, { mobile: parsed.mobile, codeHash: createHash("sha256").update(code).digest("hex"), attempts: 0, expiresAt: Date.now() + 300_000 });
    return { challengeId: id, expiresInSeconds: 300 };
  }
  verifyOtp(input: VerifyOtpInput): { accessToken: string; refreshToken: string } {
    const parsed = verifyOtpSchema.parse(input); const challenge = this.challenges.get(parsed.challengeId);
    if (!challenge || challenge.mobile !== parsed.mobile || challenge.expiresAt < Date.now()) throw new UnauthorizedException("OTP has expired");
    if (challenge.attempts >= 3) throw new HttpException("OTP attempt limit reached", 429); challenge.attempts += 1;
    if (createHash("sha256").update(parsed.code).digest("hex") !== challenge.codeHash) throw new UnauthorizedException("Invalid OTP");
    this.challenges.delete(parsed.challengeId); return { accessToken: `dev-access-${randomUUID()}`, refreshToken: `dev-refresh-${randomUUID()}` };
  }
}
